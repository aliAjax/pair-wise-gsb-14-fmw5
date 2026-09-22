<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import type { QuoteInput } from "../types";
import { useQuoteStore } from "../stores/quoteStore";
import { blockerMessages, evaluate } from "../rules/domain";

const emit = defineEmits<{ (e: "done", result: { ok: boolean; messages: string[] }): void }>();

const store = useQuoteStore();
const { customers, products, today, editingId } = storeToRefs(store);

function blank(): QuoteInput {
  return {
    customerId: "",
    productId: "",
    lockedPrice: 0,
    quantity: 0,
    startDate: today.value,
    endDate: "",
    operator: "",
    notes: "",
    approvalReason: "",
    approver: ""
  };
}

const form = reactive<QuoteInput>(blank());

const editingQuote = computed(() =>
  editingId.value ? store.quoteById(editingId.value) ?? null : null
);

// 进入/退出编辑态时同步表单
watch(
  editingId,
  (id) => {
    if (!id) {
      Object.assign(form, blank());
      return;
    }
    const q = store.quoteById(id);
    if (!q || q.status !== "draft") return;
    Object.assign(form, {
      customerId: q.customerId,
      productId: q.productId,
      lockedPrice: q.lockedPrice,
      quantity: q.quantity,
      startDate: q.startDate,
      endDate: q.endDate,
      operator: q.operator,
      notes: q.notes,
      approvalReason: q.approval?.reason ?? "",
      approver: q.approval?.approver ?? ""
    });
  },
  { immediate: true }
);

const selectedProduct = computed(() => products.value.find((p) => p.id === form.productId));
const selectedCustomer = computed(() => customers.value.find((c) => c.id === form.customerId));

const amount = computed(() => Math.max(0, form.lockedPrice) * Math.max(0, form.quantity));
const occupiedNow = computed(() =>
  selectedCustomer.value
    ? store.credits.find((c) => c.customerId === selectedCustomer.value!.id)?.occupied ?? 0
    : 0
);
const willOverCredit = computed(
  () => !!selectedCustomer.value && occupiedNow.value + amount.value > selectedCustomer.value.creditLimit
);
const belowCost = computed(
  () => !!selectedProduct.value && form.lockedPrice > 0 && form.lockedPrice < selectedProduct.value.costLine
);

const blockers = computed(() =>
  evaluate(form, {
    quotes: store.quotes,
    customers: store.customers,
    products: store.products,
    selfId: editingId.value ?? undefined
  })
);
const warnings = computed(() => blockerMessages(blockers.value));
const needApproval = computed(() => blockers.value.belowCost || blockers.value.overCredit);

function submit() {
  const result = editingId.value
    ? store.updateDraft(editingId.value, { ...form })
    : store.register({ ...form });
  if (result.ok) {
    store.cancelEdit();
    Object.assign(form, blank());
  }
  emit("done", { ok: result.ok, messages: result.messages });
}

function reset() {
  if (editingId.value) {
    store.cancelEdit();
  } else {
    Object.assign(form, blank());
  }
}

// 切换客户/油品时审批依据保持为空，避免误带到普通单（回填编辑态时不清空）
watch(
  () => [form.customerId, form.productId],
  ([cid, pid], [oldCid, oldPid]) => {
    const loadingDraft = cid !== oldCid && pid !== oldPid && !!editingId.value;
    if (loadingDraft) return;
    if (!needApproval.value) {
      form.approvalReason = "";
      form.approver = "";
    }
  }
);
</script>

<template>
  <form class="panel quote-form" @submit.prevent="submit">
    <h2>{{ editingQuote ? `编辑草稿 ${editingQuote.code}` : "登记批发锁价单" }}</h2>
    <p class="form-hint">
      {{ editingQuote ? "补齐审批依据或调整区间后保存；提交生效才占用授信并冻结价格。" : "登记后进入草稿；提交生效才占用授信并冻结价格。" }}
    </p>

    <div class="form-grid">
      <label>
        客户
        <select v-model="form.customerId" required>
          <option value="">请选择客户</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>

      <label>
        油品
        <select v-model="form.productId" required>
          <option value="">请选择油品</option>
          <option v-for="p in products" :key="p.id" :value="p.id">
            {{ p.name }}（成本线 ¥{{ p.costLine }}/{{ p.unit }}）
          </option>
        </select>
      </label>

      <label>
        锁定价（元/吨）
        <input v-model.number="form.lockedPrice" type="number" min="0" step="10" required />
      </label>

      <label>
        数量（吨）
        <input v-model.number="form.quantity" type="number" min="0" step="1" required />
      </label>

      <label>
        生效开始日
        <input v-model="form.startDate" type="date" required />
      </label>

      <label>
        生效结束日
        <input v-model="form.endDate" type="date" :min="form.startDate" required />
      </label>

      <label>
        经办人
        <input v-model="form.operator" placeholder="如：销售主管" required />
      </label>

      <label class="span-2">
        备注
        <textarea v-model="form.notes" placeholder="合同背景、结算方式等" />
      </label>
    </div>

    <div class="quote-preview">
      <div>
        <span>合同金额</span>
        <strong :class="{ alert: willOverCredit }">¥{{ amount.toLocaleString("zh-CN") }}</strong>
      </div>
      <div v-if="selectedProduct">
        <span>成本线 / 挂牌价</span>
        <strong>
          ¥{{ selectedProduct.costLine }} / ¥{{ selectedProduct.listPrice }}
          <em v-if="belowCost" class="alert">低于成本线</em>
        </strong>
      </div>
      <div v-if="selectedCustomer">
        <span>客户已占用 / 授信</span>
        <strong>
          ¥{{ occupiedNow.toLocaleString("zh-CN") }} / ¥{{ selectedCustomer.creditLimit.toLocaleString("zh-CN") }}
          <em v-if="willOverCredit" class="alert">将超授信</em>
        </strong>
      </div>
    </div>

    <div v-if="needApproval" class="approval-box">
      <p class="box-title">⚠ 触发审批：低于成本线或超授信，须填写审批依据，否则整单留草稿</p>
      <label>
        审批依据
        <textarea v-model="form.approvalReason" placeholder="如：价格委员会批复编号、战略客户让利说明" />
      </label>
      <label>
        审批人
        <input v-model="form.approver" placeholder="如：价格委员会 / 财务总监" />
      </label>
    </div>

    <ul v-if="warnings.length" class="warnings">
      <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
    </ul>

    <div class="form-actions">
      <button type="submit">{{ editingQuote ? "保存草稿修改" : "登记报价单" }}</button>
      <button type="button" class="secondary" @click="reset">{{ editingQuote ? "取消编辑" : "清空" }}</button>
    </div>
  </form>
</template>
