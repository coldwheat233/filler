// ============ 重复段落处理器 ============
// 网申的「经历」类区块默认只有一块，填第 N 条前必须先模拟点击「添加」按钮，
// 等待 DOM 真正长出新块（框架异步渲染，轮询而非固定 sleep）。

async function fwEnsureCount(rep, n) {
  let items = rep.getItems();
  if (items.length >= n) return 0;
  if (!rep.addBtn || !rep.addBtn.isConnected) {
    throw new Error("需要 " + n + " 块但只有 " + items.length + " 块，且「添加」按钮不可用");
  }
  let added = 0;
  while (rep.getItems().length < n) {
    const before = rep.getItems().length;
    const btn = rep.addBtn;
    btn.scrollIntoView({ block: "center" });
    fwClickLikeUser(btn);
    // 轮询等待块数 +1（上限 5 秒）
    let grew = false;
    for (let i = 0; i < 33; i++) {
      await fwSleep(150);
      if (rep.getItems().length > before) { grew = true; break; }
    }
    if (!grew) {
      throw new Error(
        "点击「" + (rep.addText || "添加") + "」后块数未增加：可能已达上限 " + before +
        " 条，或该按钮不是添加按钮。可手动点一次「添加」后重新生成计划"
      );
    }
    added++;
    await fwSleep(200);
    if (rep.getItems().length >= n) break;
  }
  return added;
}

// 定位第 i 块中的字段控件：克隆块结构一致，用 relPath 在对应块里重新找
function fwItemFieldEl(rep, itemIdx, field) {
  const items = rep.getItems();
  const item = items[itemIdx];
  if (!item) return null;
  if (itemIdx === 0 && field.el && field.el.isConnected) {
    // 首块优先用抽取时的引用（最稳），断链再用 relPath
    const inItem = item.contains(field.el) ? field.el : item.querySelector(field.relPath);
    return inItem || null;
  }
  try {
    return item.querySelector(field.relPath);
  } catch (e) {
    return null;
  }
}
