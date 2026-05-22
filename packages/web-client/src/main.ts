import './style.css';
import type { AgentState, WorldSnapshot, NeedKey } from '@game/protocol';
import { NEED_KEYS } from '@game/protocol';
import { Renderer } from './renderer';
import { attachCameraControls } from './input';
import { VoiceManager } from './voice';
import { createTransport, DEFAULT_SERVER_URL, type TransportChoice } from './net/transport';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const NEED_LABEL: Record<NeedKey, string> = {
  energy: 'Énergie',
  hunger: 'Faim',
  social: 'Social',
  hygiene: 'Hygiène',
  fun: 'Détente',
};
const ACTIVITY_LABEL: Record<string, string> = {
  idle: 'oisif', walking: 'marche', sleeping: 'dort', eating: 'mange',
  working: 'travaille', crafting: 'bricole', talking: 'discute', socializing: 'socialise',
};

async function main() {
  const renderer = new Renderer();
  await renderer.init($('app'));
  attachCameraControls(renderer.app.canvas, renderer.camera);

  const voice = new VoiceManager();
  const choice = await chooseTransport();
  const transport = createTransport(choice);
  $('mode').textContent = transport.label;

  let selectedId: number | null = null;
  const names = new Map<number, string>();

  // Construit le panneau de besoins une seule fois.
  const needsEl = $('needs');
  const bars = new Map<NeedKey, HTMLElement>();
  for (const key of NEED_KEYS) {
    const row = document.createElement('div');
    row.className = 'need';
    row.innerHTML = `<span>${NEED_LABEL[key]}</span><div class="bar"><i></i></div>`;
    needsEl.appendChild(row);
    bars.set(key, row.querySelector('i')!);
  }

  function showAgent(a: AgentState) {
    selectedId = a.id;
    $('panel').style.display = 'block';
    refreshPanel(a);
  }

  function refreshPanel(a: AgentState) {
    $('pname').textContent = a.name;
    $('pactivity').textContent = `Activité : ${ACTIVITY_LABEL[a.activity] ?? a.activity}`;
    $('goal').textContent = a.goal ? `« ${a.goal} »` : '';
    const inv = a.inventory.map((s) => `${s.kind}×${s.count}`).join(', ');
    $('inv').textContent = `🎒 ${inv || 'vide'}${a.houses ? `  •  🏠 ${a.houses}` : ''}`;
    for (const key of NEED_KEYS) {
      const bar = bars.get(key)!;
      const v = Math.round(a.needs[key]);
      bar.style.width = `${v}%`;
      bar.style.background = v < 25 ? '#ff6b6b' : v < 50 ? '#ffd166' : '#06d6a0';
    }
  }

  renderer.onSelect = showAgent;

  transport.onSnapshot((s: WorldSnapshot) => {
    for (const a of s.agents) names.set(a.id, a.name);
    renderer.apply(s);
    const h = Math.floor(s.timeOfDay);
    const m = Math.floor((s.timeOfDay - h) * 60);
    $('clock').textContent = `🕒 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (selectedId != null) {
      const sel = s.agents.find((a) => a.id === selectedId);
      if (sel) refreshPanel(sel);
    }
  });

  transport.onDialogue((e) => {
    const name = names.get(e.speakerId) ?? `IA ${e.speakerId}`;
    const log = $('log');
    const line = document.createElement('div');
    line.innerHTML = `<b>${name} :</b> ${escapeHtml(e.text)}`;
    log.prepend(line);
    while (log.childElementCount > 40) log.lastElementChild?.remove();
    voice.speak(e.text, e.voiceProfile);
  });

  // Chat / ordres.
  const sendChat = (isOrder: boolean) => {
    const input = $<HTMLInputElement>('chatInput');
    const text = input.value.trim();
    if (!text || selectedId == null) return;
    transport.sendChat(selectedId, text, isOrder);
    const log = $('log');
    const line = document.createElement('div');
    line.innerHTML = `<b>Vous → ${names.get(selectedId)} :</b> ${escapeHtml(text)}`;
    log.prepend(line);
    input.value = '';
  };
  $('sendBtn').addEventListener('click', () => sendChat(false));
  $<HTMLInputElement>('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat(e.shiftKey);
  });

  // Voix : nécessite une interaction utilisateur.
  $('voiceBtn').addEventListener('click', () => {
    const on = voice.toggle();
    $('voiceBtn').textContent = `🔊 Voix : ${on ? 'on' : 'off'}`;
  });

  transport.start();
}

const STORAGE_KEY = 'transportChoice';

/** Affiche la modale de démarrage (local ↔ serveur) ; mémorise le choix si demandé. */
function chooseTransport(): Promise<TransportChoice | undefined> {
  // Un override `?server=` ou un choix mémorisé court-circuitent la modale.
  if (new URLSearchParams(location.search).has('server')) return Promise.resolve({ mode: 'server', url: new URLSearchParams(location.search).get('server')?.trim() } as TransportChoice);
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return Promise.resolve(JSON.parse(saved) as TransportChoice);
    } catch {
      /* choix corrompu : on réaffiche la modale */
    }
  }


      $('startup').style.display = 'block';

  return new Promise((resolve) => {
    const startup = $('startup');
    const srvRow = $('srvRow');
    const srvUrl = $<HTMLInputElement>('srvUrl');
    const remember = $<HTMLInputElement>('remember');
    let mode: 'local' | 'server' = DEFAULT_SERVER_URL ? 'server' : 'local';
    srvUrl.value = DEFAULT_SERVER_URL;

    const paint = () => {
      $('modeLocal').classList.toggle('active', mode === 'local');
      $('modeServer').classList.toggle('active', mode === 'server');
      srvRow.style.display = mode === 'server' ? 'block' : 'none';
    };
    $('modeLocal').addEventListener('click', () => { mode = 'local'; paint(); });
    $('modeServer').addEventListener('click', () => { mode = 'server'; paint(); });
    paint();

    $('playBtn').addEventListener('click', () => {
      const choice: TransportChoice =
        mode === 'server' ? { mode: 'server', url: srvUrl.value.trim() } : { mode: 'local' };
      if (remember.checked) localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
      startup.style.display = 'none';
      resolve(choice);
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

main().catch(console.error);
