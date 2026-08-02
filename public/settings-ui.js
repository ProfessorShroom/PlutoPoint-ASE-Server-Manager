function renderNpcReplacements(items) {
  const container = document.getElementById("npc-replacements-container");
  container.innerHTML = "";
  items.forEach((item) => addNpcReplacementRow(item.from, item.to));
}

function addNpcReplacementRow(fromVal = "", toVal = "") {
  const container = document.getElementById("npc-replacements-container");
  const row = document.createElement("div");
  row.className =
    "flex items-center space-x-2 bg-slate-900 p-2 rounded border border-slate-700";

  let fromOptionsHtml = commonDinos
    .map(
      (d) =>
        `<option value="${d}" ${d === fromVal ? "selected" : ""}>${d}</option>`,
    )
    .join("");
  let toOptionsHtml =
    `<option value="" ${!toVal ? "selected" : ""}>-- No Spawn / Despawn --</option>` +
    commonDinos
      .map(
        (d) =>
          `<option value="${d}" ${d === toVal ? "selected" : ""}>${d}</option>`,
      )
      .join("");

  row.innerHTML = `
                <select class="npc-from bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm flex-1">
                    ${fromOptionsHtml}
                </select>
                <span class="text-xs text-slate-400">➔ replace with</span>
                <select class="npc-to bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm flex-1">
                    ${toOptionsHtml}
                </select>
                <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300 font-bold px-2">&times;</button>
            `;
  container.appendChild(row);
}

function renderEngramEntries(items) {
  const container = document.getElementById("engram-entries-container");
  container.innerHTML = "";
  items.forEach((item) =>
    addEngramEntryRow(
      item.className,
      item.level,
      item.points,
      item.hidden,
      item.removePreReq,
    ),
  );
}

function addEngramEntryRow(
  className = "",
  level = 1,
  points = 1,
  hidden = false,
  removePreReq = false,
) {
  const container = document.getElementById("engram-entries-container");
  const row = document.createElement("div");
  row.className =
    "grid grid-cols-1 md:grid-cols-6 gap-2 bg-slate-900 p-3 rounded border border-slate-700 items-center";
  row.innerHTML = `
                <div class="md:col-span-2">
                    <label class="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Engram Class Name</label>
                    <input type="text" class="engram-class w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" placeholder="EngramEntry_DinoSkillReset_C" value="${className}">
                </div>
                <div>
                    <label class="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Level Requirement</label>
                    <input type="number" class="engram-level w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" placeholder="1" value="${level}">
                </div>
                <div>
                    <label class="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Engram Points Cost</label>
                    <input type="number" class="engram-points w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs" placeholder="1" value="${points}">
                </div>
                <div class="flex flex-col justify-center space-y-1 text-xs pt-4">
                    <label class="flex items-center space-x-1.5"><input type="checkbox" class="engram-hidden" ${hidden ? "checked" : ""}> <span class="text-slate-300">Engram Hidden</span></label>
                    <label class="flex items-center space-x-1.5"><input type="checkbox" class="engram-prereq" ${removePreReq ? "checked" : ""}> <span class="text-slate-300">Remove PreReq</span></label>
                </div>
                <div class="text-right pt-4">
                    <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-400 hover:text-red-300 text-xs font-semibold">Remove</button>
                </div>
            `;
  container.appendChild(row);
}

function renderCraftingCosts(items) {
  const container = document.getElementById("crafting-costs-container");
  container.innerHTML = "";
  items.forEach((item) => addCraftingCostRow(item.itemClass, item.resources));
}

function addCraftingCostRow(itemClass = "", resources = []) {
  const container = document.getElementById("crafting-costs-container");
  const row = document.createElement("div");
  row.className = "bg-slate-900 p-3 rounded border border-slate-700 space-y-2";

  let resHtml = resources
    .map(
      (r) => `
                <div class="flex items-center space-x-2 text-xs resource-row">
                    <input type="text" class="res-type bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white flex-1" placeholder="ResourceItemTypeString" value="${r.type}">
                    <input type="number" step="any" class="res-amount bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white w-24" placeholder="Amount" value="${r.amount}">
                    <button type="button" onclick="this.parentElement.remove()" class="text-red-400 font-bold px-1">&times;</button>
                </div>
            `,
    )
    .join("");

  row.innerHTML = `
                <div class="flex items-center space-x-2">
                    <input type="text" class="craft-item-class w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm" placeholder="ItemClassString (e.g. PrimalItemConsumable_DinoSkillReset_C)" value="${itemClass}">
                    <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-400 hover:text-red-300 text-xs">Delete Override</button>
                </div>
                <div class="space-y-1 pl-4 border-l border-slate-700 resource-list">
                    <div class="text-xs font-semibold text-slate-400">Required Resources:</div>
                    ${resHtml}
                    <button type="button" onclick="addResourceRequirement(this)" class="text-cyan-400 hover:underline text-xs">+ Add Resource Requirement</button>
                </div>
            `;
  container.appendChild(row);
}

function addResourceRequirement(btn) {
  const list = btn.parentElement;
  const div = document.createElement("div");
  div.className = "flex items-center space-x-2 text-xs resource-row";
  div.innerHTML = `
                <input type="text" class="res-type bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white flex-1" placeholder="ResourceItemTypeString">
                <input type="number" step="any" class="res-amount bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white w-24" placeholder="Amount" value="1">
                <button type="button" onclick="this.parentElement.remove()" class="text-red-400 font-bold px-1">&times;</button>
            `;
  list.insertBefore(div, btn);
}
