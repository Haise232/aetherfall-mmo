// Interfaz de misiones: seguimiento, aviso para hablar, ventana de diálogo con NPCs y carteles.
import { ITEMS, JOBS, jobOf, npcOf, questOf, type JobId, type QuestDef } from "@mmorpg/shared";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

export interface QuestUiState {
  quest?: string;
  questCount: number;
  /** Metros hasta el objetivo de la misión (NPC o lugar), si lo hay. */
  goalDistance?: number;
  /** NPC al alcance para hablar, si lo hay. */
  nearName?: string;
  /** Faena disponible con E cuando no hay nadie con quien hablar (ok: false si no es de tu oficio). */
  action?: { text: string; ok: boolean };
}

export interface TalkContext { quest?: QuestDef; questCount: number; job?: string }

function rewardText(q: QuestDef) {
  const parts: string[] = [];
  if (q.reward.xp) parts.push(`${q.reward.xp} XP`);
  for (const it of q.reward.items ?? []) parts.push((it.qty > 1 ? it.qty + " × " : "") + (ITEMS[it.item]?.name ?? it.item));
  if (q.reward.job) parts.push("un oficio");
  return parts.join(" · ");
}

export function createQuestUi(
  onChoose: (job: JobId) => void,
  onChangeClass: () => void,
  onQuestTalk: (npcId: string) => void,
  onClose: () => void,
  onMarket: () => void = () => {},
) {
  // seguimiento de la misión (izquierda, bajo el estado de conexión)
  const tracker = document.createElement("div"); tracker.id = "quest"; tracker.hidden = true;
  tracker.innerHTML = `<div class="qt"></div><div class="obj"><span class="txt"></span><span class="d"></span></div>`;
  // aviso para hablar
  const prompt = document.createElement("div"); prompt.id = "prompt"; prompt.hidden = true;
  prompt.innerHTML = `<kbd>E</kbd><span></span>`;
  // cartel (misión nueva / completada)
  const toast = document.createElement("div"); toast.id = "toast"; toast.hidden = true; toast.setAttribute("role", "status");
  toast.innerHTML = `<small></small><strong></strong><span></span>`;
  // ventana de diálogo del NPC
  const dlg = document.createElement("div"); dlg.id = "guild"; dlg.hidden = true;
  dlg.innerHTML = `
    <div class="hang" role="dialog" aria-labelledby="guild-h"><div class="rod"></div>
    <form>
      <p class="who"></p>
      <h2 id="guild-h"></h2>
      <p class="say" aria-live="polite" title="Clic para ver el texto entero"></p>
      <fieldset class="pick"><legend>Elige tu oficio</legend><div class="jobs">${JOBS.map(j => `
        <div><input type="radio" name="job" id="job-${j.id}" value="${j.id}"><label for="job-${j.id}" style="--c:${hex(j.color)}">
          <b>${j.name}</b><span>${j.desc}</span><small>Recoge: ${j.gets}</small></label></div>`).join("")}</div></fieldset>
      <div class="quest-panel" hidden><p class="qp-title"></p><p class="quest-desc"></p><p class="quest-prog"></p><p class="quest-reward"></p></div>
      <p class="note"></p>
      <div class="go"><button type="submit" class="ok" disabled>Elige un oficio</button><button type="button" class="quest-action" hidden></button><button type="button" class="market-open" hidden>Ver la subasta</button><button type="button" class="change-job" hidden>Cambiar de oficio</button><button type="button" class="change-class" hidden>Cambiar de clase</button><button type="button" class="more" hidden>Seguir hablando</button><button type="button" class="no">Adiós</button></div>
      <p class="keys"><kbd>E</kbd> o <kbd>Esc</kbd> para cerrar</p>
    </form></div>`;
  document.body.append(tracker, prompt, toast, dlg);
  const q = <T extends HTMLElement>(root: HTMLElement, s: string) => root.querySelector<T>(s)!;
  const say = q(dlg, ".say"), pick = q(dlg, ".pick"), note = q(dlg, ".note"), ok = q<HTMLButtonElement>(dlg, ".ok"), no = q<HTMLButtonElement>(dlg, ".no");
  const changeJob = q<HTMLButtonElement>(dlg, ".change-job"), changeClass = q<HTMLButtonElement>(dlg, ".change-class"), questAction = q<HTMLButtonElement>(dlg, ".quest-action"), more = q<HTMLButtonElement>(dlg, ".more");
  const questPanel = q<HTMLDivElement>(dlg, ".quest-panel");
  const marketBtn = q<HTMLButtonElement>(dlg, ".market-open");
  const form = q<HTMLFormElement>(dlg, "form");

  // texto que se escribe letra a letra; un clic (o Seguir hablando) lo completa
  let typeTimer = 0, typeFull = "";
  function speak(text: string) {
    clearInterval(typeTimer); typeFull = text;
    if (reduceMotion.matches) { say.textContent = text; return; }
    let i = 0; say.textContent = "";
    typeTimer = window.setInterval(() => {
      i += 2; say.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typeTimer);
    }, 16);
  }
  const typing = () => say.textContent !== typeFull;
  const finishTyping = () => { clearInterval(typeTimer); say.textContent = typeFull; };
  say.addEventListener("click", finishTyping);

  for (const t of ["keydown", "keyup", "pointerdown", "wheel"]) dlg.addEventListener(t, e => {
    e.stopPropagation();
    if (t !== "keydown") return;
    const k = e as KeyboardEvent;
    if (k.key === "Escape" || (k.code === "KeyE" && !k.repeat)) { k.preventDefault(); api.close(); }
    else if (k.code === "Space" && typing()) { k.preventDefault(); finishTyping(); }
  });
  dlg.addEventListener("pointerdown", e => { if (e.target === dlg) api.close(); }); // clic fuera del estandarte
  form.addEventListener("change", () => {
    const j = jobOf(q<HTMLInputElement>(dlg, "input[name=job]:checked").value);
    ok.disabled = !j; ok.textContent = j ? "Aprender el oficio de " + j.name.toLowerCase() : "Elige un oficio";
  });
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    const sel = dlg.querySelector<HTMLInputElement>("input[name=job]:checked");
    if (!sel || ok.hidden) { api.close(); return; }
    ok.disabled = true; ok.textContent = "Apuntando…";
    onChoose(sel.value as JobId);
  });
  no.addEventListener("click", () => api.close());
  more.addEventListener("click", () => {
    if (typing()) { finishTyping(); return; }
    const lines = npcOf(currentNpc ?? undefined)?.dialog ?? [];
    if (!lines.length) return;
    line = (line + 1) % lines.length;
    speak(lines[line]!);
    more.textContent = line === lines.length - 1 ? "Volver a empezar" : "Seguir hablando";
  });
  changeJob.addEventListener("click", () => {
    pick.hidden = note.hidden = ok.hidden = false;
    questPanel.hidden = questAction.hidden = more.hidden = true;
    changeJob.hidden = changeClass.hidden = true;
    speak("¿A qué oficio quieres dedicarte ahora? Ten en cuenta que empezarás de aprendiz.");
    form.reset(); ok.disabled = true; ok.textContent = "Elige un oficio";
    setTimeout(() => q<HTMLInputElement>(dlg, "input[name=job]").focus(), 30);
  });
  changeClass.addEventListener("click", () => { api.close(); onChangeClass(); });
  marketBtn.addEventListener("click", () => { api.close(); onMarket(); }); // cierra el diálogo y abre la subasta
  questAction.addEventListener("click", () => {
    if (questAction.dataset.act === "close") { api.close(); return; }
    if (currentNpc) onQuestTalk(currentNpc);
    questAction.disabled = true; questAction.textContent = "…";
  });

  let toastTimer = 0, lastTrack = "", lastPrompt = "", currentNpc: string | null = null, line = 0;
  const api = {
    get open() { return !dlg.hidden; },
    get npc() { return currentNpc; },
    /** Abre el diálogo con un NPC según la misión activa. */
    talk(npcId: string, ctx: TalkContext) {
      const npc = npcOf(npcId);
      if (!npc) return;
      currentNpc = npcId; line = 0;
      const { quest, questCount, job } = ctx;
      q(dlg, ".who").textContent = npc.title;
      q(dlg, "h2").textContent = npc.name;
      pick.hidden = note.hidden = ok.hidden = true;
      questPanel.hidden = questAction.hidden = true;
      changeJob.hidden = changeClass.hidden = true;
      marketBtn.hidden = npcId !== "auctioneer";
      questAction.disabled = false; delete questAction.dataset.act;
      more.hidden = npc.dialog.length < 2; more.textContent = "Seguir hablando";
      let text = npc.dialog[0] ?? "…";
      let focus: HTMLElement = more.hidden ? no : more;

      const showQuest = (qd: QuestDef, prog: string) => {
        questPanel.hidden = false;
        q(dlg, ".qp-title").textContent = qd.title;
        q(dlg, ".quest-desc").textContent = qd.description;
        q(dlg, ".quest-prog").textContent = prog;
        q(dlg, ".quest-reward").textContent = "Recompensa: " + rewardText(qd);
      };

      if (npcId === "guild_master") {
        // gremio: oficio y cambio de clase
        if (!job) {
          text = "Así que eres nuevo en Valdoria. Aquí nadie vive solo de la espada: cada vecino tiene un oficio y el gremio lleva la cuenta. Dime a qué quieres dedicarte.";
          pick.hidden = note.hidden = ok.hidden = false; more.hidden = true;
          note.textContent = "Puedes cambiar de oficio o de clase siempre que hables con el maestro (al cambiar de oficio, empiezas desde el nivel 1).";
          form.reset(); ok.disabled = true; ok.textContent = "Elige un oficio";
          focus = q<HTMLInputElement>(dlg, "input[name=job]");
        } else {
          const j = jobOf(job);
          text = j ? `Bienvenido de nuevo, ${j.name.toLowerCase()}. ${j.where} Acércate y pulsa E para trabajar: cuanto más lo hagas, más rápido irás y más cosas buenas sacarás.` : "Bienvenido de nuevo. Tu antiguo oficio ya no existe en el gremio: elige uno nuevo.";
          changeJob.hidden = changeClass.hidden = false;
        }
      } else if (npcId === "auctioneer") {
        focus = marketBtn; // el subastador: botón principal para abrir la subasta
      } else if (quest && quest.giver === npcId) {
        if (quest.type === "kill" || quest.type === "collect") {
          const done = questCount >= quest.count;
          showQuest(quest, `${quest.type === "collect" ? "Llevas" : "Has abatido"} ${Math.min(questCount, quest.count)} de ${quest.count}`);
          if (done) {
            text = "¡Justo lo que te pedí! Buen trabajo. Toma, esto es para ti.";
            questAction.hidden = false; questAction.textContent = "Entregar"; focus = questAction;
          } else {
            text = questCount > 0 ? "Vas por buen camino. Vuelve cuando lo tengas todo." : npc.dialog[0] ?? "Vuelve cuando lo tengas.";
          }
        } else if (quest.type === "pray") {
          showQuest(quest, "");
          text = "Ve hasta la estatua, al fondo de la nave, y reza ante ella. La diosa escucha a quien tiene paciencia.";
          note.hidden = false; note.innerHTML = "Junto a la estatua pulsa <kbd>F</kbd> para rezar.";
          questAction.hidden = false; questAction.textContent = "Iré a rezar"; questAction.dataset.act = "close"; focus = questAction;
        } else if (quest.type === "talk") {
          showQuest(quest, "");
          questAction.hidden = false; questAction.textContent = "Completar"; focus = questAction;
        }
      }
      speak(text);
      dlg.hidden = false;
      setTimeout(() => focus.focus(), 30);
    },
    close() {
      if (dlg.hidden) return;
      clearInterval(typeTimer);
      dlg.hidden = true; currentNpc = null;
      onClose();
    },
    toast(kind: "new" | "done", small: string, title: string, sub = "") {
      toast.className = kind; toast.hidden = false;
      q(toast, "small").textContent = small; q(toast, "strong").textContent = title; q(toast, "span").textContent = sub;
      toast.style.animation = "none"; void toast.offsetWidth; toast.style.animation = "";
      clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4200);
    },
    update(state: QuestUiState | null) {
      const act = !state?.nearName ? state?.action : undefined;
      const p = !dlg.hidden ? "" : state?.nearName ? "Hablar con " + state.nearName : act?.text ?? "";
      if (p !== lastPrompt) { lastPrompt = p; prompt.hidden = !p; prompt.querySelector("span")!.textContent = p; prompt.classList.toggle("off", !!act && !act.ok); }
      const quest = state ? questOf(state.quest) : undefined;
      if (!state || !quest) { tracker.hidden = true; lastTrack = ""; return; }
      tracker.hidden = false;
      let objText: string;
      if (quest.type === "talk") objText = `Habla con ${npcOf(quest.giver)?.name ?? quest.giver}`;
      else if (quest.type === "pray") objText = "Reza ante la estatua de la diosa en la catedral";
      else if (state.questCount >= quest.count) objText = `Vuelve con ${npcOf(quest.giver)?.name ?? quest.giver}`;
      else objText = `${ITEMS[quest.target]?.name ?? quest.target}: ${Math.min(state.questCount, quest.count)}/${quest.count}`;
      const g = state.goalDistance;
      const d = g === undefined || g < 6 ? "" : Math.round(g) + " m";
      const key = quest.title + objText + d;
      if (key === lastTrack) return;
      lastTrack = key;
      q(tracker, ".qt").textContent = quest.title;
      q(tracker, ".txt").textContent = objText;
      q(tracker, ".d").textContent = d;
    },
  };
  return api;
}
