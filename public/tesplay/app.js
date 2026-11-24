'use strict';

const desktopForm = document.querySelector('#desktop-form');
const displayAddress = document.querySelector('#display-address');

displayAddress.addEventListener('input', () => displayAddress.setCustomValidity(''));
desktopForm.addEventListener('submit', (event) => {
  event.preventDefault();
  let address;
  try {
    address = new URL(displayAddress.value);
  } catch {
    // The same error below also covers schemes the launcher cannot open.
  }
  if (!address || !['http:', 'https:'].includes(address.protocol) || address.username || address.password) {
    displayAddress.setCustomValidity('Enter an HTTP or HTTPS display address without login details.');
    displayAddress.reportValidity();
    return;
  }
  window.location.assign(address.href);
});

const destination = document.querySelector('#destination');
destination.addEventListener('input', () => destination.setCustomValidity(''));
document.querySelector('#route-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const place = destination.value.trim();
  if (!place) {
    destination.setCustomValidity('Enter an address or place.');
    destination.reportValidity();
    return;
  }
  const route = new URL('https://www.waze.com/ul');
  route.searchParams.set('q', place);
  route.searchParams.set('navigate', 'yes');
  route.searchParams.set('utm_source', 'tesplay');
  window.location.assign(route.href);
});

const charging = document.querySelector('#charging-form');
const chargeTotal = document.querySelector('#charge-total');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
charging.addEventListener('input', () => { chargeTotal.textContent = ''; });
charging.addEventListener('submit', (event) => {
  event.preventDefault();
  const energy = document.querySelector('#energy').valueAsNumber;
  const rate = document.querySelector('#rate').valueAsNumber;
  const fee = document.querySelector('#session-fee').valueAsNumber;
  const total = energy * rate + fee;
  chargeTotal.textContent = `${money.format(total)} total · ${money.format(total / energy)}/kWh`;
});

const profiles = {
  v8: { waveform: 'triangle', harmonics: [1, 2.02, 3], idle: 46, sweep: 170 },
  inline: { waveform: 'triangle', harmonics: [1, 2, 4.06], idle: 52, sweep: 220 },
  electric: { waveform: 'sine', harmonics: [1, 1.5, 2.01], idle: 85, sweep: 410 },
};
const engineProfile = document.querySelector('#engine-profile');
const throttle = document.querySelector('#throttle');
const engineToggle = document.querySelector('#engine-toggle');
const engineStatus = document.querySelector('#engine-status');
let engine;

function tuneEngine() {
  if (!engine) return;
  const profile = profiles[engineProfile.value];
  const power = Number(throttle.value) / 100;
  const pitch = profile.idle + power * profile.sweep;
  const now = engine.audio.currentTime;
  for (const [index, oscillator] of engine.oscillators.entries()) {
    oscillator.type = profile.waveform;
    oscillator.frequency.setTargetAtTime(pitch * profile.harmonics[index], now, .09);
  }
  engine.gain.gain.setTargetAtTime(.035 + .045 * power, now, .09);
}

function stopEngine() {
  if (!engine) return;
  const { audio, oscillators, gain } = engine;
  engine = undefined;
  gain.gain.setTargetAtTime(0, audio.currentTime, .025);
  for (const oscillator of oscillators) oscillator.stop(audio.currentTime + .15);
  setTimeout(() => { void audio.close(); }, 200);
  engineToggle.textContent = 'Start sound';
}

async function startEngine() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('Web Audio is unavailable');
  const audio = new Audio();
  try {
    await audio.resume();
    if (window.location.hash !== '#engine') {
      await audio.close();
      return;
    }
    const gain = audio.createGain();
    gain.gain.value = 0;
    gain.connect(audio.destination);
    const oscillators = [.65, .23, .12].map((level) => {
      const oscillator = audio.createOscillator();
      const partial = audio.createGain();
      partial.gain.value = level;
      oscillator.connect(partial).connect(gain);
      return oscillator;
    });
    engine = { audio, gain, oscillators };
    tuneEngine();
    for (const oscillator of oscillators) oscillator.start();
    engineToggle.textContent = 'Stop sound';
  } catch (error) {
    engine = undefined;
    await audio.close();
    throw error;
  }
}

engineToggle.addEventListener('click', async () => {
  if (engine) {
    stopEngine();
    return;
  }
  engineToggle.disabled = true;
  engineStatus.hidden = true;
  try {
    await startEngine();
  } catch {
    engineStatus.textContent = 'This browser could not start audio.';
    engineStatus.hidden = false;
  } finally {
    engineToggle.disabled = false;
  }
});
engineProfile.addEventListener('change', tuneEngine);
throttle.addEventListener('input', tuneEngine);
window.addEventListener('hashchange', () => {
  if (window.location.hash !== '#engine') stopEngine();
});
window.addEventListener('pagehide', stopEngine);
