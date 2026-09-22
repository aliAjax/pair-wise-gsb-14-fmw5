<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useQuoteStore } from "../stores/quoteStore";
import { formatMoney, formatNumber } from "../utils/format";

const store = useQuoteStore();
const { conflicts } = storeToRefs(store);
</script>

<template>
  <section class="panel conflict-panel">
    <div class="toolbar">
      <h2>冲突清单</h2>
      <span class="panel-sub">列出客户、油品、数量和额度，刷新后重新推导</span>
    </div>

    <div v-if="conflicts.length === 0" class="empty">暂无冲突：时段无重叠，授信均在额度内</div>

    <table v-else class="conflict-table">
      <thead>
        <tr>
          <th>类型</th>
          <th>客户</th>
          <th>油品</th>
          <th class="num">数量（吨）</th>
          <th class="num">涉及额度</th>
          <th>明细</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in conflicts" :key="row.id" :class="row.kind === 'credit' ? 'row-credit' : 'row-overlap'">
          <td>
            <span class="conflict-kind" :class="`kind-${row.kind}`">
              {{ row.kind === "overlap" ? "时段重叠" : "授信超限" }}
            </span>
          </td>
          <td>{{ row.customerName }}</td>
          <td>{{ row.productName }}</td>
          <td class="num">{{ formatNumber(row.quantity) }}</td>
          <td class="num">{{ formatMoney(row.amount) }}</td>
          <td class="detail-cell">{{ row.detail }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
