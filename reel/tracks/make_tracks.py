#!/usr/bin/env python3
"""Original background music for Inkbot Design reels.

Every track is synthesised from scratch here (no samples, no loops from libraries),
so there is nothing to license. Run once to (re)build the tracks:

    python3 reel/tracks/make_tracks.py      # needs numpy, scipy and ffmpeg

It writes reel/tracks/<name>.m4a (40 s, 44.1 kHz stereo AAC). The reel renderer picks
one per reel from the slug, trims it to the reel's length and fades it out, so
consecutive reels don't all sound the same. Tracks start with the full groove on beat
one (no slow intro), because the first second of a reel decides whether people stay.
"""
import os
import subprocess
import tempfile

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt
from scipy.io import wavfile

SR = 44100
LEN = 40.0
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def t_axis(d):
    return np.arange(int(d * SR)) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def place(buf, sig, start):
    i = int(start * SR)
    if i >= len(buf):
        return
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n]


def saw(f, d, harmonics=14, detune=0.0, phase=0.0):
    t = t_axis(d)
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if f * k > 9000:
            break
        out += np.sin(2 * np.pi * f * (1 + detune) * k * t + phase * k) / k
    return out


def env_adsr(d, a=0.3, r=0.6, s=1.0):
    n = int(d * SR)
    e = np.full(n, s)
    na, nr = min(int(a * SR), n), min(int(r * SR), n)
    e[:na] = np.linspace(0, s, na)
    e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def pad_chord(notes, d, cutoff, bright=1.0):
    cutoff = cutoff * 1.8  # brighter pads so the chords read on phone speakers
    left = np.zeros(int(d * SR))
    right = np.zeros(int(d * SR))
    for m in notes:
        f = hz(m)
        for det, side in ((-0.004, 0), (0.0, 2), (0.005, 1)):
            v = saw(f, d, detune=det, phase=rng.uniform(0, 6.28))
            if side in (0, 2):
                left += v
            if side in (1, 2):
                right += v
    e = env_adsr(d, a=0.25, r=0.5)
    return lp(left * e, cutoff * bright), lp(right * e, cutoff * bright)


def fm_key(m, d=1.6, index=1.8, decay=1.4):
    t = t_axis(d)
    f = hz(m)
    i_env = index * np.exp(-t / 0.35)
    tone = np.sin(2 * np.pi * f * t + i_env * np.sin(2 * np.pi * f * 2 * t))
    return tone * np.exp(-t / decay) * np.minimum(1, t / 0.004)


def pluck(m, d=0.6, decay=0.22):
    t = t_axis(d)
    f = hz(m)
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    return lp(tone * np.exp(-t / decay) * np.minimum(1, t / 0.003), 3500)


def kick(d=0.35, f0=105, f1=44):
    t = t_axis(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.045)
    ph = 2 * np.pi * np.cumsum(f) / SR
    click = np.exp(-t / 0.003) * 0.25
    return (np.sin(ph) * np.exp(-t / 0.16) + click) * np.minimum(1, t / 0.002)


def hat(d=0.06, decay=0.018):
    t = t_axis(d)
    return hp(rng.standard_normal(len(t)), 7500) * np.exp(-t / decay)


def shaker(d=0.08):
    t = t_axis(d)
    n = bp(rng.standard_normal(len(t)), 4000, 11000)
    return n * np.minimum(1, t / 0.012) * np.exp(-t / 0.03)


def clap(d=0.25):
    t = t_axis(d)
    n = bp(rng.standard_normal(len(t)), 900, 3200)
    bursts = sum(np.exp(-np.maximum(0, t - o) / 0.012) * (t >= o) for o in (0, 0.011, 0.022))
    return n * (0.5 * bursts + np.exp(-t / 0.09) * 0.6)


def rim(d=0.08):
    t = t_axis(d)
    return (np.sin(2 * np.pi * 1700 * t) * 0.6 + bp(rng.standard_normal(len(t)), 1500, 5000) * 0.4) * np.exp(-t / 0.012)


def sub(m, d):
    t = t_axis(d)
    return np.sin(2 * np.pi * hz(m) * t) * env_adsr(d, a=0.01, r=min(0.08, d / 2))


def reverb(x, seconds=1.6, seed=1):
    r = np.random.default_rng(seed)
    t = t_axis(seconds)
    ir = r.standard_normal(len(t)) * np.exp(-t / (seconds / 4.5))
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    return fftconvolve(x, ir)[:len(x)]


def duck(bpm, depth=0.45, release=0.16):
    t = t_axis(LEN)
    beat = 60 / bpm
    since = np.mod(t, beat)
    return 1 - depth * np.exp(-since / release)


def build(name, bpm, prog, style):
    """prog: list of (root_midi, chord_notes) per bar; looped to LEN."""
    n = int(LEN * SR)
    L, R = np.zeros(n), np.zeros(n)
    pads_l, pads_r = np.zeros(n), np.zeros(n)
    keys = np.zeros(n)
    bass = np.zeros(n)
    drums = np.zeros(n)
    beat = 60 / bpm
    bar = 4 * beat
    bars = int(np.ceil(LEN / bar))
    for b in range(bars):
        root, chord = prog[b % len(prog)]
        t0 = b * bar
        # filter opens over the first two bars, then breathes with the phrase
        bright = 0.75 + 0.25 * min(1, b / 2) + 0.15 * np.sin(b * np.pi / 4)
        pl, pr = pad_chord(chord, bar + 0.5, style['pad_cut'], bright)
        place(pads_l, pl, t0)
        place(pads_r, pr, t0)
        # bass
        if style['bass'] == 'pulse':  # eighth-note pulse
            for k in range(8):
                place(bass, sub(root - 12, beat / 2 * 0.9), t0 + k * beat / 2)
        else:  # long notes with a push on beat 3 and the last eighth
            place(bass, sub(root - 12, beat * 2.2), t0)
            place(bass, sub(root - 12, beat * 1.3), t0 + 2 * beat)
            place(bass, sub(root - 12 + style.get('bass_step', 7), beat * 0.45), t0 + 3.5 * beat)
        # melodic layer
        if style['keys'] == 'arp':
            pat = style.get('arp', [0, 1, 2, 1, 3, 2, 1, 2])
            tones = sorted(chord) + [sorted(chord)[0] + 12]
            for k, idx in enumerate(pat):
                place(keys, pluck(tones[idx % len(tones)] + 12, decay=0.2) * (0.9 if k % 2 == 0 else 0.6), t0 + k * beat / 2)
        elif style['keys'] == 'ep':
            for k, off in enumerate((0, 1.5, 2.5, 3.5)):
                notes = sorted(chord)[1:] if k else sorted(chord)
                for m in notes:
                    place(keys, fm_key(m + 12, d=1.4, index=1.4, decay=0.9) * (0.5 if k else 0.7), t0 + off * beat)
        # drums
        for k in range(4):
            tb = t0 + k * beat
            if style['kick'] == 'four' or (style['kick'] == 'half' and k in (0, 2)) or (style['kick'] == 'broken' and k in (0, 2)):
                place(drums, kick() * 0.9, tb)
            if style['kick'] == 'broken' and k == 1:
                place(drums, kick() * 0.5, tb + beat / 2)
            if style.get('back') == 'clap' and k in (1, 3):
                place(drums, clap() * 0.35, tb)
            if style.get('back') == 'rim' and k in (1, 3):
                place(drums, rim() * 0.35, tb)
            for h in range(2 if style.get('hats') == 8 else 4):
                step = beat / (2 if style.get('hats') == 8 else 4)
                acc = 1.0 if (h * step) % (beat / 2) else 0.55
                place(drums, (hat() if style.get('hats') == 8 else shaker()) * 0.16 * acc, tb + h * step + (0.012 if h % 2 else 0))
    sc = duck(bpm, depth=style.get('duck', 0.4))
    pads_l, pads_r = pads_l * sc, pads_r * sc
    bass = lp(bass, 220) * duck(bpm, depth=0.6, release=0.12)
    keys_l = keys * 0.9
    keys_r = np.roll(keys, int(0.011 * SR)) * 0.9  # small Haas spread
    def norm(x):
        return x / (np.max(np.abs(x)) + 1e-9)
    pads_l, pads_r = norm(pads_l) * 0.30, norm(pads_r) * 0.30
    bass = norm(bass) * 0.26
    kl, kr = norm(keys_l) * style.get('keys_level', 0.22) * 2.0, norm(keys_r) * style.get('keys_level', 0.22) * 2.0
    # kick body is mostly below what phone speakers play; keep it, but lead with the click, snaps and hats
    drums = norm(hp(drums, 60)) * 0.45 + norm(hp(drums, 2500)) * 0.18
    wet_l = reverb(pads_l * 0.5 + kl, seed=1)
    wet_r = reverb(pads_r * 0.5 + kr, seed=2)
    L = pads_l + kl + bass + drums + 0.28 * wet_l
    R = pads_r + kr + bass + drums + 0.28 * wet_r
    # master for phone speakers: tame the very low end and lift presence (parallel mid boost)
    L, R = hp(L, 35), hp(R, 35)
    L = L + 0.9 * bp(L, 350, 5000) + 0.25 * hp(L, 5000)
    R = R + 0.9 * bp(R, 350, 5000) + 0.25 * hp(R, 5000)
    stereo = np.stack([L, R], axis=1)
    stereo = np.tanh(1.2 * stereo / np.max(np.abs(stereo))) / np.tanh(1.2)
    fade = int(1.0 * SR)
    stereo[-fade:] *= np.linspace(1, 0, fade)[:, None]
    stereo *= 0.89  # about -1 dBFS peak before loudness normalisation
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'x.wav')
        wavfile.write(wav, SR, (stereo * 32767).astype(np.int16))
        out = os.path.join(HERE, f'{name}.m4a')
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-af', 'loudnorm=I=-15:TP=-1.5:LRA=7',
                        '-ar', '44100', '-c:a', 'aac', '-b:a', '192k', out], check=True)
    print('wrote', out)


# Chords as MIDI notes (pads sit around middle C; bass is an octave below the root).
A, C, D, E, F, G, B = 57, 60, 62, 64, 65, 67, 59
TRACKS = {
    # warm, steady, a little serious: minor key, half-time feel
    'boardroom': (96, [(A, [57, 60, 64, 67]), (F, [57, 60, 65, 64]), (C, [55, 60, 64, 59 + 12]), (G, [55, 59, 62, 64])],
                  dict(pad_cut=1400, bass='long', keys='arp', kick='half', back='rim', hats=8, duck=0.35,
                       arp=[0, 2, 1, 3, 0, 2, 4, 2])),
    # bright and confident: major key, four-on-the-floor, electric piano stabs
    'clarity': (104, [(D, [62, 66, 69, 73]), (B, [59, 62, 66, 69]), (G, [59, 62, 66, 67]), (57, [57, 61, 64, 66])],
                dict(pad_cut=1800, bass='pulse', keys='ep', kick='four', back='clap', hats=16, duck=0.45, keys_level=0.2)),
    # calm, focused: slow minor groove with a gentle pluck line
    'focus': (88, [(E, [59, 62, 64, 66]), (C, [60, 64, 67, 71]), (G, [59, 62, 67, 69]), (D, [57, 62, 66, 69])],
              dict(pad_cut=1200, bass='long', keys='arp', kick='broken', back='rim', hats=16, duck=0.3, keys_level=0.18,
                   arp=[0, 1, 2, 3, 2, 1, 0, 2])),
    # forward momentum: driving eighth-note bass, claps, brighter pads
    'momentum': (112, [(F, [57, 60, 64, 65]), (G, [59, 62, 65, 67]), (E, [59, 62, 64, 67]), (A, [57, 60, 64, 67])],
                 dict(pad_cut=2000, bass='pulse', keys='arp', kick='four', back='clap', hats=16, duck=0.5, keys_level=0.17,
                      arp=[0, 2, 3, 2, 1, 2, 3, 4])),
}

if __name__ == '__main__':
    for name, (bpm, prog, style) in TRACKS.items():
        build(name, bpm, prog, style)
