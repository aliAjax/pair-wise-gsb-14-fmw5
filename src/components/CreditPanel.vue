<script setup lang="ts">
// 授信占用台：按客户展示总额度/当日占用/可用额度及逐笔占用
import { computed, ref } from "vue";
import { useDeskStore } from "../store";
import { creditBoard } from "../rules";
import { num } from "../format";

const store = useDeskStore();
const expanded = ref<Set<string>>(new Set(store.customers[0] ? [store.customers[0].id] : []));

const board = computed(() => creditBoard(store.customers, store.quotes, store.today));

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}
</script>

<template>
  <section class="panel credit-panel">
    <h2>授信占用台</h2>
    <p class="hint">统计日：{{ store.today }}；仅统计生效中且覆盖当日的报价单，撤回与到期自动释放。</p>
    <div class="credit-list">
      <article v-for="row in board" :key="row.customer.id" class="credit-card" :class="{ over: row.occupied > row.customer.creditLimit }">
        <header @click="toggle(row.customer.id)">
          <div>
            <p class="credit-name">{{ row.customer.name }}</p>
            <p class="credit-line">
              总额度 {{ num(row.customer.creditLimit) }} ·
              占用 <strong>{{ num(row.occupied) }}</strong> ·
              可用 <strong :class="{ neg: row.available < 0 }">{{ num(row.available) }}</strong>
            </p>
          </div>
          <span class="credit-rate">{{ (row.usageRate * 100).toFixed(1) }}%</span>
        </header>
        <div class="credit-track">
          <div
            class="credit-fill"
            :class="{ over: row.occupied > row.customer.creditLimit }"
            :style="{ width: `${Math.min(100, row.usageRate * 100)}%` }"
          />
        </div>
        <ul v-if="expanded.has(row.customer.id)" class="credit-items">
          <li v-for="q in row.items" :key="q.id">
            <span>{{ q.quoteNo }} · {{ store.fuelMap.get(q.fuelId)?.name }}</span>
            <span>{{ q.startDate }} ~ {{ q.endDate }} · {{ num(q.quantity) }} {{ store.fuelMap.get(q.fuelId)?.unit }}</span>
            <strong>{{ num(store.amountOf(q)) }} 元</strong>
          </li>
          <li v-if="row.items.length === 0" class="muted">当日无占用</li>
        </ul>
      </article>
    </div>
  </section>
</template>
