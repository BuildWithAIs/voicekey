# scripts/

`benchmark-asr.mjs` exercises the production ASR worker with existing, local model
files and a PCM16 mono 16 kHz WAV. Build workers with `npx vite build`, then run:

```bash
node scripts/benchmark-asr.mjs classic /path/to/sensevoice /path/to/audio.wav 2
node scripts/benchmark-asr.mjs streaming /path/to/x-asr /path/to/audio.wav 2
node scripts/benchmark-asr.mjs streaming /path/to/x-asr /path/to/audio.wav 2 /path/to/dictionary.json
```

The optional dictionary is a JSON string array (at most 200 entries). No audio,
transcript or dictionary contents are logged or uploaded. Streaming input is paced
at capture speed. Output includes load latency, first partial latency, final wait,
maximum unconsumed audio, CPU time, process peak RSS, termination time and RSS after
worker teardown. Classic elapsed time includes cold model loading. RSS belongs to
the benchmark process and its workers, not to the entire Electron application.

Use short, 60-second and five-minute samples, silence, noisy speech and empty/full
dictionaries. Compare 1/2/4 threads on AC and battery on representative laptops.
Run each case repeatedly and report P50/P95; these smoke measurements alone do not
establish recognition accuracy, energy use or cross-platform performance. The
harness stops at 2 GiB RSS or ten minutes; it does not bypass production safeguards.

## Session smoke measurements (2026-10-11)

These are single runs in the development environment, not laptop benchmarks.
SenseVoice used a repeated English sample to exercise whole-recording length:
60 seconds completed in about 40 seconds at 599 MiB peak process RSS. A 300-second
input was stopped by the harness after 360 seconds without a final result, with
observed RSS around 1.7 GiB. Production imposes a five-minute inference deadline
and a separate RSS guard; removing fixed recording cuts does not make long
SenseVoice inference cheap.

With a 7.15-second English sample, X-ASR at two threads loaded in about 10.7 seconds,
produced first partial text about 2.3 seconds after paced input started, and finished
about 0.26 seconds after input ended; peak RSS was about 1.03 GiB. Single runs at
one/four threads had similar final wait (0.23/0.27 seconds); cache and host load
prevent interpreting their different cold-load times as a reliable thread ranking.
This validates separate cold-start buffering and steady-state backlog limits,
not a universal latency promise. Measure real microphones, varied languages and
battery usage on the supported desktop platforms before setting performance SLAs.
