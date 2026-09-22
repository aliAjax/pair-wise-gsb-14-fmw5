<script setup lang="ts">
// 报价单登记表单：所有单据先存草稿；阻断冲突会在下方明确列出
import { computed, reactive } from "vue";
import { useDeskStore } from "../store";
import type { ConflictItem } from "../types";
import { CONFLICT_KIND_LABEL } from "../types";
import { validateQuote } from "../rules";
import { num } from "../format";

const store = useDeskStore();

const form = reactive({
  customerId: "",
  fuelId: "",
  lockedPrice: undefined as number | undefined,
  quantity: undefined as number | undefined,
  startDate: store.today,
  endDate: "",
  operator: "",
  approvalBasis: ""
});

const selectedFuel = computed(() => store.fuelMap.get(form.fuelId));
const selectedCustomer = computed(() => store.customerMap.get(form.customerId));

const previewConflicts = computed<ConflictItem[]>(() => {
  if (!form.customerId || !form.fuelId || !form.lockedPrice || !form.quantity) return [];
  return validateQuote(
    {
      customerId: form.customerId,
      fuelId: form.fuelId,
      lockedPrice: form.lockedPrice,
      quantity: form.quantity,
      startDate: form.startDate,
      endDate: form.endDate,
      operator: form.operator,
      approvalBasis: form.approvalBasis
    },
    { customers: store.customers, fuels: store.fuels, quotes: store.quotes },
    store.today
  );
});

const previewAmount = computed(() =>
  form.lockedPrice && form.quantity ? num(form.lockedPrice * form.quantity) : "0"
);

const emitted = defineEmits<{ (e: "notice", conflicts: ConflictItem[]): void }>();

function submit() {
  const result = store.registerQuote({
    customerId: form.customerId,
    fuelId: form.fuelId,
    lockedPrice: Number(form.lockedPrice) || 0,
    quantity: Number(form.quantity) || 0,
    startDate: form.startDate,
    endDate: form.endDate,
    operator: form.operator,
    approvalBasis: form.approvalBasis
  });
  emitted("notice", result.conflicts);
  if (result.ok) {
    form.customerId = "";
    form.fuelId = "";
    form.lockedPrice = undefined;
    form.quantity = undefined;
    form.endDate = "";
    form.operator = "";
    form.approvalBasis = "";
  }
}

const canSubmit = computed(
  () =>
    form.customerId &&
    form.fuelId &&
    (form.lockedPrice || 0) > 0 &&
    (form.quantity || 0) > 0 &&
    form.startDate &&
    form.endDate
);
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>批发锁价报价登记</h2>
    <p class="hint">登记后整单先入草稿；合同生效才占用授信，生效时再次复核全部规则。</p>
    <div class="form-grid">
      <label>
        客户
        <select v-model="form.customerId" required>
          <option value="">请选择客户</option>
          <option v-for="c in store.customers" :key="c.id" :value="c.id">
            {{ c.name }}（授信 {{ num(c.creditLimit) }} 元）
          </option>
        </select>
      </label>

      <label>
        油品
        <select v-model="form.fuelId" required>
          <option value="">请选择油品</option>
          <option v-for="f in store.fuels" :key="f.id" :value="f.id">
            {{ f.name }}（成本线 {{ num(f.costPrice) }} / 挂牌 {{ num(f.listPrice) }} 元·{{ f.unit }}）
          </option>
        </select>
      </label>

      <div class="form-row">
        <label>
          锁定价（元/{{ selectedFuel?.unit || "单位" }}）
          <input v-model.number="form.lockedPrice" type="number" min="0" step="0.01" required />
        </label>
        <label>
          数量（{{ selectedFuel?.unit || "单位" }}）
          <input v-model.number="form.quantity" type="number" min="0" step="1" required />
        </label>
      </div>

      <div class="form-row">
        <label>
          生效起
          <input v-model="form.startDate" type="date" required />
        </label>
        <label>
          生效止
          <input v-model="form.endDate" type="date" :min="form.startDate" required />
        </label>
      </div>

      <label>
        业务员
        <input v-model="form.operator" placeholder="登记人姓名" required />
      </label>

      <div v-if="previewConflicts.some((c) => c.kind === 'belowCost' || c.kind === 'overCredit')" class="warn-box">
        <p v-for="c in previewConflicts.filter((x) => x.kind === 'belowCost' || x.kind === 'overCredit')" :key="c.detail">
          <span :class="['flag', c.blocking ? 'flag-block' : 'flag-warn']">{{ CONFLICT_KIND_LABEL[c.kind] }}</span>
          {{ c.detail }}
        </p>
        <label class="basis-label">
          审批依据（低于成本线 / 超授信必填，否则整单留草稿无法生效）
          <textarea v-model="form.approvalBasis" placeholder="填写特批批件号、审批人与审批结论" />
        </label>
      </div>

      <div class="amount-bar">
        本单锁价额度：<strong>{{ previewAmount }} 元</strong>
        <span v-if="selectedCustomer">
          · 客户当日已占用 {{ num(store.occupiedOf(selectedCustomer.id)) }} /
          授信 {{ num(selectedCustomer.creditLimit) }} 元
        </span>
      </div>

      <ul v-if="previewConflicts.length" class="conflict-mini">
        <li v-for="(c, i) in previewConflicts" :key="i" :class="c.blocking ? 'is-block' : 'is-warn'">
          {{ CONFLICT_KIND_LABEL[c.kind] }}：{{ c.detail }}
        </li>
      </ul>

      <button type="submit" :disabled="!canSubmit">登记报价（存草稿）</button>
    </div>
  </form>
</template>
