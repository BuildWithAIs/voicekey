# audio/

Main-process audio pipeline for mutually exclusive classic and streaming local transcription.

## Files

- `index.ts` - Re-exports the audio module surface.
- `session-manager.ts` - Owns the active recording session, selects classic or streaming mode from configuration, rejects an enabled-but-missing streaming model instead of silently falling back, forwards live partial text to the HUD, and runs a 10s final-marker watchdog.
- `processor.ts` - Classic mode converts chunks to 16k mono WAV for SenseVoice and merges them in order; streaming mode forwards PCM and accepts the final result after Paraformer decoding and isolated CT-Transformer punctuation. Both paths share one finalizer, which optionally calls cloud refinement exactly once after recording ends, then writes history and injects text.
- `converter.ts` - Initializes FFmpeg and converts captured audio to MP3 or 16k mono WAV, with optional low-volume gain.

## Current Flow

1. The main process starts a session and sends `sessionId`, microphone selection, gain mode, and ASR mode to the hidden recorder.
2. Classic mode rotates MediaRecorder chunks every 30 seconds; streaming mode sends roughly 100 ms Float32 PCM frames from an AudioWorklet.
3. Classic finalization waits for every indexed chunk. Streaming finalization flushes PCM, finishes the active online recognizer, and adds punctuation locally; it never calls SenseVoice.
4. Live streaming partials update the HUD while recording. The punctuated final replaces the HUD transcript before optional refinement, and no partial is sent to the refinement API.
5. Non-empty final text is refined exactly once when enabled, regardless of transcript length, then recorded and injected.
6. Any failure or cancellation aborts the matching mode and discards late results.
