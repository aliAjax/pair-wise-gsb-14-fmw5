<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useQuoteStore } from "../stores/quoteStore";
import { formatMoney, formatNumber } from "../utils/format";

const store = useQuoteStore();
const { credits } = storeToRefs(store);

function barColor(ratio: number, over: boolean): string {
  if (over) return "#c84b31";
  if (ratio >= 0.8) return "#d98a1f";
  return "#176b87";
}
</script>

<template>
  <section class="panel">
    <div class="toolbar">
      <h2>授信占用台</h2>
      <span class="panel-sub">仅生效中合同占用，撤回释放、到期回退</span>
    </div>
    <div class="credit-list">
      <div v-for="c in credits" :key="c.customerId" class="credit-row" :class="{ over: c.overLimit }">
        <div class="credit-head">
          <strong>{{ c.customerName }}</strong>
          <span :class="['credit-ratio', { alert: c.overLimit }]">
            {{ (c.ratio * 100).toFixed(1) }}%
          </span>
        </div>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{
              width: `${Math.min(100, c.ratio * 100)}%`,
              background: barColor(c.ratio, c.overLimit)
            }"
          />
        </div>
        <div class="credit-meta">
          <span>占用 {{ formatMoney(c.occupied) }}</span>
          <span>授信 {{ formatMoney(c.limit) }}</span>
          <span>
            可用
            <strong :class="{ alert: c.available < 0 }">{{ formatMoney(c.available) }}</strong>
          </span>
          <span>生效量 {{ formatNumber(c.quantity) }} 吨</span>
        </div>
      </div>
    </div>
  </section>
</template>
