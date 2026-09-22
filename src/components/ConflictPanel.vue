<script setup lang="ts">
// 冲突台：列出客户、油品、数量、额度，区分阻断（必须处理）与已审批提示
import { computed } from "vue";
import { CONFLICT_KIND_LABEL, type ConflictItem } from "../types";
import { num } from "../format";

const props = defineProps<{ conflicts: ConflictItem[]; title?: string; dismissible?: boolean }>();
const emit = defineEmits<{ (e: "dismiss"): void }>();

const sorted = computed(() => {
  const weight = { overlap: 0, belowCost: 1, overCredit: 2, invalidRange: 3 };
  return [...props.conflicts].sort((a, b) => Number(b.blocking) - Number(a.blocking) || weight[a.kind] - weight[b.kind]);
});
</script>

<template>
  <section v-if="conflicts.length" class="conflict-panel" :class="{ 'has-block': conflicts.some((c) => c.blocking) }">
    <header>
      <h2>
        {{ title || "冲突与审批提示" }}
        <span class="conflict-count">{{ conflicts.filter((c) => c.blocking).length }} 条阻断 / {{ conflicts.length }} 条合计</span>
      </h2>
      <button v-if="dismissible" type="button" class="link-btn" @click="emit('dismiss')">关闭提示</button>
    </header>
    <table>
      <thead>
        <tr>
          <th>类型</th><th>客户</th><th>油品</th><th>数量</th><th>涉及额度</th><th>说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(c, i) in sorted" :key="i" :class="c.blocking ? 'row-block' : 'row-warn'">
          <td>
            <span :class="['flag', c.blocking ? 'flag-block' : 'flag-warn']">{{ CONFLICT_KIND_LABEL[c.kind] }}</span>
          </td>
          <td>{{ c.customerName }}</td>
          <td>{{ c.fuelName }}</td>
          <td>{{ num(c.quantity) }}</td>
          <td>{{ num(c.amount) }} 元</td>
          <td>{{ c.detail }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
