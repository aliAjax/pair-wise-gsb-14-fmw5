<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { QUOTE_STATUS_LABEL, type QuoteStatus } from "../types";
import { useQuoteStore } from "../stores/quoteStore";
import QuoteCard from "./QuoteCard.vue";

const store = useQuoteStore();
const { sortedQuotes } = storeToRefs(store);

const statusFilter = ref<"all" | QuoteStatus>("all");
const customerFilter = ref<string>("all");
const { customers } = storeToRefs(store);

const filtered = computed(() =>
  sortedQuotes.value.filter(
    (q) =>
      (statusFilter.value === "all" || q.status === statusFilter.value) &&
      (customerFilter.value === "all" || q.customerId === customerFilter.value)
  )
);

const statusOptions: Array<"all" | QuoteStatus> = [
  "all",
  "draft",
  "effective",
  "withdrawn",
  "expired"
];
const statusText = (s: "all" | QuoteStatus) =>
  s === "all" ? "全部状态" : QUOTE_STATUS_LABEL[s as QuoteStatus];

function editDraft(id: string) {
  store.startEdit(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
</script>

<template>
  <section class="panel list-panel">
    <div class="toolbar">
      <h2>锁价报价单</h2>
      <div class="filters">
        <select v-model="customerFilter">
          <option value="all">全部客户</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="statusFilter">
          <option v-for="s in statusOptions" :key="s" :value="s">{{ statusText(s) }}</option>
        </select>
      </div>
    </div>

    <div class="record-grid">
      <div v-if="filtered.length === 0" class="empty">暂无匹配报价单</div>
      <QuoteCard v-for="quote in filtered" :key="quote.id" :quote="quote" @edit="editDraft" />
    </div>
  </section>
</template>
