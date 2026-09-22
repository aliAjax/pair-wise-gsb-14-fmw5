<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { Quote } from "../types";
import { QUOTE_STATUS_LABEL } from "../types";
import { useQuoteStore } from "../stores/quoteStore";
import { formatDateTime, formatMoney } from "../utils/format";

const props = defineProps<{ quote: Quote }>();
defineEmits<{ (e: "edit", id: string): void }>();
const store = useQuoteStore();

const customer = computed(() => store.customerById(props.quote.customerId));
const product = computed(() => store.productById(props.quote.productId));

const showVersions = ref(false);
const showAmend = ref(false);
const amendForm = reactive({ price: props.quote.lockedPrice, reason: "", operator: "" });

const statusClass = computed(() => `status-${props.quote.status}`);

function openAmend() {
  amendForm.price = props.quote.lockedPrice;
  amendForm.reason = "";
  amendForm.operator = "";
  showAmend.value = true;
}

function confirmAmend() {
  store.amend(props.quote.id, { ...amendForm });
  showAmend.value = false;
}

function activate() {
  store.activate(props.quote.id);
}
function withdraw() {
  store.withdraw(props.quote.id);
}
function remove() {
  store.remove(props.quote.id);
}
</script>

<template>
  <article class="record" :class="statusClass">
    <div class="record-head">
      <div>
        <p class="record-title">{{ customer?.name }} · {{ product?.name }}</p>
        <p class="record-code">{{ quote.code }} · {{ quote.startDate }} 至 {{ quote.endDate }}</p>
      </div>
      <span class="status" :class="statusClass">{{ QUOTE_STATUS_LABEL[quote.status] }}</span>
    </div>

    <div class="details">
      <span>锁定价：<strong>¥{{ quote.lockedPrice }}/{{ product?.unit }}</strong></span>
      <span>数量：<strong>{{ quote.quantity }}{{ product?.unit }}</strong></span>
      <span>合同金额：<strong>{{ formatMoney(quote.lockedPrice * quote.quantity) }}</strong></span>
      <span>
        授信占用：
        <strong :class="{ frozen: quote.status === 'effective' }">
          {{ quote.status === "effective" ? formatMoney(quote.frozenOccupied) + "（已冻结）" : "未占用" }}
        </strong>
      </span>
      <span>经办人：{{ quote.operator }}</span>
      <span>版本数：v{{ quote.versions.length }}</span>
    </div>

    <div v-if="product && quote.lockedPrice < product.costLine" class="flag flag-cost">
      锁定价低于成本线 ¥{{ product.costLine }}
    </div>

    <div v-if="quote.approval" class="approval-record">
      <strong>审批依据：</strong>{{ quote.approval.reason || "（依据缺失）" }}
      <span class="approver">审批人：{{ quote.approval.approver || "—" }} · {{ formatDateTime(quote.approval.approvedAt) }}</span>
      <span class="approval-tags">
        <em v-if="quote.approval.belowCost">低于成本线</em>
        <em v-if="quote.approval.overCredit">超授信</em>
      </span>
    </div>

    <p v-if="quote.notes" class="note">{{ quote.notes }}</p>

    <div class="actions">
      <button v-if="quote.status === 'draft'" type="button" class="secondary" @click="$emit('edit', quote.id)">
        编辑草稿
      </button>
      <button v-if="quote.status === 'draft'" type="button" @click="activate">提交生效（占用授信）</button>
      <button v-if="quote.status === 'effective'" type="button" class="secondary" @click="withdraw">
        撤回（释放 {{ formatMoney(quote.frozenOccupied) }}）
      </button>
      <button v-if="quote.status === 'effective'" type="button" class="secondary" @click="openAmend">
        改价（另存版本）
      </button>
      <button type="button" class="secondary" @click="showVersions = !showVersions">
        {{ showVersions ? "收起版本链" : `版本链 (${quote.versions.length})` }}
      </button>
      <button
        v-if="quote.status === 'draft' || quote.status === 'withdrawn' || quote.status === 'expired'"
        type="button"
        class="danger"
        @click="remove"
      >
        删除
      </button>
    </div>

    <p v-if="quote.status === 'effective'" class="freeze-hint">
      生效于 {{ formatDateTime(quote.activatedAt) }}：价格已冻结，改价仅追加原因版本；授信冻结额不随后续改价变化。
    </p>
    <p v-if="quote.status === 'withdrawn'" class="freeze-hint">
      撤回于 {{ formatDateTime(quote.withdrawnAt) }}，授信已释放。
    </p>
    <p v-if="quote.status === 'expired'" class="freeze-hint">
      到期于 {{ formatDateTime(quote.expiredAt) }}，授信已回退。
    </p>

    <div v-if="showVersions" class="version-chain">
      <h4>价格版本链</h4>
      <div v-for="v in quote.versions" :key="v.version" class="version-row">
        <span class="v-no">v{{ v.version }}</span>
        <span class="v-price">¥{{ v.price }}</span>
        <span class="v-reason">{{ v.reason }}</span>
        <span class="v-meta">{{ v.operator }} · {{ formatDateTime(v.changedAt) }}</span>
      </div>
    </div>

    <div v-if="showAmend" class="amend-box">
      <h4>登记改价版本（当前价 ¥{{ quote.lockedPrice }} 保持为 v{{ quote.versions.length }}）</h4>
      <div class="amend-grid">
        <label>
          新锁定价
          <input v-model.number="amendForm.price" type="number" min="0" step="10" />
        </label>
        <label class="span-2">
          改价原因
          <input v-model="amendForm.reason" placeholder="如：国际油价回落，客户续约让利" />
        </label>
        <label>
          经办人
          <input v-model="amendForm.operator" />
        </label>
      </div>
      <div class="actions">
        <button type="button" @click="confirmAmend">追加版本</button>
        <button type="button" class="secondary" @click="showAmend = false">取消</button>
      </div>
    </div>
  </article>
</template>
