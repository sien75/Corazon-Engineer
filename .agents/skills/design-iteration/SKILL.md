---
name: design-iteration
description: 把一个需求落成 development/iterations 下的设计记录（SOP Phase 1）
---

把一个需求落成一份设计记录（SOP Phase 1），别的先一律不碰。

1. **先确认再动笔**：目标、范围（含明确不做什么）、验收标准。信息不够就继续问，别猜。
2. 决定迭代号：看 `development/iterations/` 里已有的 `[YYMM]-NN`，取下一个序号。
3. 写 `development/iterations/[YYMM]-[NN]-[短标题].md`，结构照现有文件来：
   `## 需求` / `## 现状` / `## 决策` / `## 影响面` / `## 任务拆分`。
   「现状」必须贴真实证据——文件路径、行号、接口名、实际行为，不要写印象里的样子。
4. 写完停下，等用户确认，再进 Phase 2（契约 → 静态关系 → 测试 → 代码）。

只写 `development/iterations/` 下的这一个文件。这一阶段不写契约、不写代码。
