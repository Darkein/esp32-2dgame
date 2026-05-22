import './style.css';
import type { AgentState, WorldSnapshot, NeedKey } from '@game/protocol';
import { NEED_KEYS } from '@game/protocol';
import { Renderer } from './renderer';
import { attachCameraControls } from './input';
import { VoiceManager } from './voice';
import { createTransport } from './net/transport';

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
  const transport = createTransport();
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
    voice.enable();
    const on = voice.toggle();
    $('voiceBtn').textContent = `🔊 Voix : ${on ? 'on' : 'off'}`;
  });

  transport.start();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

main().catch(console.error);
