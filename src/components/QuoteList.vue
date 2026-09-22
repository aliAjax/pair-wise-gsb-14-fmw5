<script setup lang="ts">
// 报价单列表：生效/撤回/删除/调价版本链操作
import { computed, reactive, ref } from "vue";
import { useDeskStore } from "../store";
import { QUOTE_STATUS_LABEL, type ConflictItem, type Quote } from "../types";
import { num, dt } from "../format";

const store = useDeskStore();
const emit = defineEmits<{ (e: "notice", conflicts: ConflictItem[]): void }>();

const statusFilter = ref<"all" | Quote["status"]>("all");
const customerFilter = ref("all");

const filtered = computed(() =>
  store.quotes.filter(
    (q) =>
      (statusFilter.value === "all" || q.status === statusFilter.value) &&
      (customerFilter.value === "all" || q.customerId === customerFilter.value)
  )
);

function nameOf(q: Quote) {
  return store.customerMap.get(q.customerId)?.name || "未知客户";
}
function fuelOf(q: Quote) {
  return store.fuelMap.get(q.fuelId);
}

function activate(q: Quote) {
  emit("notice", store.activateQuote(q.id).conflicts);
}
function withdraw(q: Quote) {
  if (window.confirm(`确认撤回 ${q.quoteNo}？撤回后立即释放授信。`)) {
    emit("notice", store.withdrawQuote(q.id).conflicts);
  }
}
function remove(q: Quote) {
  if (window.confirm(`确认删除 ${q.quoteNo}？此操作不可恢复。`)) store.removeQuote(q.id);
}

// —— 生效后调价：另存原因版本 ——
const changingId = ref<string | null>(null);
const changeForm = reactive({
  lockedPrice: 0,
  quantity: 0,
  reason: "",
  approvalBasis: "",
  operator: ""
});

function openChange(q: Quote) {
  changingId.value = q.id;
  changeForm.lockedPrice = q.lockedPrice;
  changeForm.quantity = q.quantity;
  changeForm.reason = "";
  changeForm.approvalBasis = "";
  changeForm.operator = q.operator;
}

function submitChange(q: Quote) {
  const result = store.changePrice(q.id, { ...changeForm });
  emit("notice", result.conflicts);
  if (result.ok) changingId.value = null;
}

const statusClass: Record<Quote["status"], string> = {
  draft: "st-draft",
  active: "st-active",
  withdrawn: "st-withdrawn",
  expired: "st-expired"
};
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>锁价报价单（{{ filtered.length }}）</h2>
      <div class="filters">
        <select v-model="customerFilter">
          <option value="all">全部客户</option>
          <option v-for="c in store.customers" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="statusFilter">
          <option value="all">全部状态</option>
          <option v-for="(label, key) in QUOTE_STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
    </div>

    <div class="record-grid">
      <div v-if="filtered.length === 0" class="empty">暂无匹配报价单</div>

      <article v-for="q in filtered" :key="q.id" class="record">
        <div class="record-head">
          <div>
            <p class="record-title">{{ q.quoteNo }}</p>
            <p class="record-sub">{{ nameOf(q) }} · {{ fuelOf(q)?.name }}（{{ fuelOf(q)?.unit }}）</p>
          </div>
          <span :class="['status', statusClass[q.status]]">{{ QUOTE_STATUS_LABEL[q.status] }}</span>
        </div>

        <div class="details">
          <span>锁定价：<strong>{{ num(q.lockedPrice) }}</strong> 元/{{ fuelOf(q)?.unit }}</span>
          <span>数量：<strong>{{ num(q.quantity) }}</strong> {{ fuelOf(q)?.unit }}</span>
          <span>锁价额度：<strong>{{ num(store.amountOf(q)) }}</strong> 元</span>
          <span>生效区间：{{ q.startDate }} ~ {{ q.endDate }}</span>
          <span v-if="fuelOf()">成本线：{{ num(fuelOf()!.costPrice) }} 元 · 挂牌：{{ num(fuelOf()!.listPrice) }}</span>
          <span>业务员：{{ q.operator }}</span>
        </div>

        <p v-if="q.approvalBasis" class="note">审批依据：{{ q.approvalBasis }}</p>
        <p v-else-if="q.lockedPrice < (fuelOf()?.costPrice ?? Infinity)" class="note note-danger">
          低于成本线且缺少审批依据，整单留草稿
        </p>

        <div v-if="q.versions.length" class="versions">
          <p class="versions-title">价格版本链（{{ q.versions.length }} 版，生效后价格冻结，改动另存）</p>
          <ol>
            <li v-for="v in [...q.versions].reverse()" :key="v.version" :class="{ 'is-current': v.version === q.versions.length }">
              <div class="v-head">
                <strong>v{{ v.version }}</strong>
                <span v-if="v.version === q.versions.length" class="v-current">当前版本</span>
                <span class="v-time">{{ dt(v.changedAt) }} · {{ v.operator }}</span>
              </div>
              <div class="v-body">
                锁定价 {{ num(v.lockedPrice) }} 元 · 数量 {{ num(v.quantity) }} ·
                额度 {{ num(v.lockedPrice * v.quantity) }} 元
                <em v-if="v.version > 1">原因：{{ v.reason }}</em>
                <em v-if="v.approvalBasis">依据：{{ v.approvalBasis }}</em>
              </div>
            </li>
          </ol>
        </div>

        <!-- 调价表单 -->
        <div v-if="changingId === q.id" class="change-box">
          <p class="versions-title">生效后调价（区间不变，价格/数量改动将另存为 v{{ q.versions.length + 1 }}）</p>
          <div class="form-row">
            <label>新锁定价<input v-model.number="changeForm.lockedPrice" type="number" step="0.01" /></label>
            <label>新数量<input v-model.number="changeForm.quantity" type="number" step="1" /></label>
          </div>
          <label>变更原因（必填）<input v-model="changeForm.reason" placeholder="如：客户追加采购量重新议价" /></label>
          <label>审批依据（低于成本线/超授信时必填）
            <textarea v-model="changeForm.approvalBasis" placeholder="批件号、审批人与结论" />
          </label>
          <div class="actions">
            <button type="button" @click="submitChange(q)">另存新版本</button>
            <button type="button" class="secondary" @click="changingId = null">取消</button>
          </div>
        </div>

        <div class="actions">
          <button v-if="q.status === 'draft'" type="button" @click="activate(q)">合同生效 · 占用授信</button>
          <button v-if="q.status === 'active'" type="button" @click="openChange(q)">调价（另存版本）</button>
          <button v-if="q.status === 'active'" type="button" class="secondary" @click="withdraw(q)">撤回 · 释放授信</button>
          <button v-if="q.status === 'draft' || q.status === 'withdrawn'" type="button" class="danger" @click="remove(q)">删除</button>
          <span v-if="q.status === 'expired'" class="muted">已到期回退，授信已释放（{{ q.expiredAt }}）</span>
          <span v-if="q.status === 'withdrawn'" class="muted">撤回于 {{ dt(q.withdrawnAt) }}</span>
        </div>
      </article>
    </div>
  </section>
</template>
