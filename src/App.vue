<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useQuoteStore, type ActionResult } from "./stores/quoteStore";
import { formatMoney } from "./utils/format";
import QuoteForm from "./components/QuoteForm.vue";
import QuoteList from "./components/QuoteList.vue";
import CreditPanel from "./components/CreditPanel.vue";
import ConflictPanel from "./components/ConflictPanel.vue";

const store = useQuoteStore();
const { metrics, conflicts, today, lastResult } = storeToRefs(store);

const banner = ref<ActionResult | null>(null);
function showBanner(result: { ok: boolean; messages: string[] }) {
  banner.value = result;
}

function refresh() {
  banner.value = store.refresh();
}
function resetDemo() {
  if (confirm("将清空本地改动并恢复演示报价单，确认继续？")) {
    banner.value = store.resetDemo();
  }
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 批发业务</p>
          <h1>批发锁价与信用占用台</h1>
          <p class="subtitle">
            报价单登记客户、油品、锁定价、数量与生效区间；同客户同油品时段不得重叠；
            低于成本线或超授信须附审批依据，否则整单留草稿。合同生效才占用授信，撤回释放、到期回退；
            生效后价格冻结，改动另存原因版本。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Pinia</span>
          <span class="tag">localStorage</span>
          <span class="tag">无新增依赖</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>报价单总数 / 草稿</span>
          <strong>{{ metrics.total }}<em>草稿 {{ metrics.draft }}</em></strong>
        </article>
        <article class="metric">
          <span>生效中合同</span>
          <strong>{{ metrics.effective }}</strong>
        </article>
        <article class="metric">
          <span>授信冻结合计</span>
          <strong class="metric-money">{{ formatMoney(metrics.occupied) }}</strong>
        </article>
        <article class="metric" :class="{ alarm: conflicts.length > 0 }">
          <span>待处理冲突</span>
          <strong>{{ conflicts.length }}</strong>
        </article>
      </section>

      <div v-if="banner || lastResult" class="banner" :class="(banner ?? lastResult)!.ok ? 'ok' : 'warn'">
        <ul>
          <li v-for="(m, i) in (banner ?? lastResult)!.messages" :key="i">{{ m }}</li>
        </ul>
      </div>

      <div class="top-actions">
        <span class="today">业务日期：{{ today }}（刷新将自动回退到期合同授信）</span>
        <div class="actions">
          <button type="button" @click="refresh">刷新并对账</button>
          <button type="button" class="secondary" @click="resetDemo">恢复演示数据</button>
        </div>
      </div>

      <section class="workspace">
        <QuoteForm @done="showBanner" />
        <div class="right-col">
          <CreditPanel />
        </div>
      </section>

      <ConflictPanel class="gap" />
      <QuoteList class="gap" />

      <footer class="foot">
        数据（localStorage）、规则（纯函数）、存储（持久化适配）与界面（Vue 组件）分层独立；刷新后报价、授信占用与版本链一致。
      </footer>
    </div>
  </main>
</template>
