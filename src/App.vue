<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useDeskStore } from "./store";
import type { ConflictItem } from "./types";
import { money } from "./format";
import QuoteForm from "./components/QuoteForm.vue";
import QuoteList from "./components/QuoteList.vue";
import CreditPanel from "./components/CreditPanel.vue";
import ConflictPanel from "./components/ConflictPanel.vue";

const store = useDeskStore();
const notice = ref<ConflictItem[] | null>(null);

onMounted(() => store.refresh());

function onNotice(conflicts: ConflictItem[]) {
  notice.value = conflicts;
}

const shownConflicts = computed<ConflictItem[]>(() =>
  notice.value !== null ? notice.value : store.globalConflicts
);

function resetAll() {
  if (window.confirm("确认恢复演示种子数据？当前全部报价单将被覆盖。")) {
    store.resetAll();
    notice.value = null;
  }
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油批发 · 风控最小闭环</p>
          <h1>批发锁价与信用占用台</h1>
          <p class="subtitle">
            登记客户、油品、锁定价、数量与生效区间；同客户同油品时段不得重叠，低于成本线或超授信须写审批依据，
            否则整单留草稿。合同生效才占用授信，撤回释放、到期回退；生效后价格冻结，改动另存原因版本。
          </p>
        </div>
        <div class="top-actions">
          <button type="button" class="secondary" @click="store.refresh()">刷新一致性</button>
          <button type="button" class="secondary" @click="resetAll">重置演示数据</button>
        </div>
      </header>

      <section class="metrics">
        <article class="metric"><span>报价单总数</span><strong>{{ store.metrics.total }}</strong></article>
        <article class="metric"><span>生效中（占用授信）</span><strong>{{ store.metrics.active }}</strong></article>
        <article class="metric"><span>草稿（待审批/生效）</span><strong>{{ store.metrics.draft }}</strong></article>
        <article class="metric"><span>当日授信占用合计</span><strong>{{ money(store.metrics.occupied) }}</strong></article>
      </section>

      <ConflictPanel
        :conflicts="shownConflicts"
        :dismissible="notice !== null"
        :title="notice !== null ? '本次操作结果' : '现存冲突扫描'"
        @dismiss="notice = null"
      />

      <section class="workspace workspace-wide">
        <QuoteForm @notice="onNotice" />
        <CreditPanel />
      </section>

      <section class="workspace">
        <QuoteList @notice="onNotice" />
      </section>

      <footer class="foot">
        数据保存在浏览器 localStorage；数据模型（types）、业务规则（rules）、存储（storage）、状态（store）与界面（components）分层，无新增依赖。
      </footer>
    </div>
  </main>
</template>
