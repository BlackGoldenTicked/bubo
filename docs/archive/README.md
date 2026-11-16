# Archive

过程记录，不是现行规范。这里的东西**不随代码维护**：内容描述的是当时的设计与实施
过程，可能引用已经删除的目录、包或交付面。看现行行为请回到
[architecture](../architecture.md)、[conventions](../conventions.md)、
[modules](../modules/)、[topics](../topics/) 与 [decisions](../decisions/)。

## plans/

一次性实施计划（`YYYY-MM-DD-topic.md`）。新的大改动仍在这里留一份计划：复制
[plans/\_plan.md](plans/_plan.md)，改名为 `YYYY-MM-DD-topic.md`，写清范围、取舍与验证方式。
计划落地后不再回填更新，它的历史价值在于“当时的约束和放弃的方案”，不在“现在的行为”。

## spark/

早期的探索草稿与想法记录。没有任何入链，也不构成承诺；凡已成结论的部分都已沉淀为
[decisions](../decisions/)。与当前仓库无关的草稿（CLI 包设计、落地页改版等）已随对应
交付面删除。

## 判断标准

- 描述“现在怎么运作” → 放 `docs/modules/` 或 `docs/topics/`，并随代码同步。
- 描述“为什么这样定” → 放 `docs/decisions/`，改动时新增 ADR 而不是改旧记录。
- 描述“当时打算怎么做” → 放这里，不再维护。
