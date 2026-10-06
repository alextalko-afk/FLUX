import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendMessageDto } from '../../../apps/server/src/messages/dto/messages.dto';

/**
 * Locks the API contract for voice notes: `duration`/`waveform` are optional
 * but must be rejected when they are nonsensical, so a malformed client cannot
 * persist negative lengths or garbage waveform samples.
 */
const base = {
  type: 'VOICE',
  clientTempId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  mediaId: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
};

async function validateDto(payload: Record<string, unknown>) {
  const instance = plainToInstance(SendMessageDto, payload);
  return validate(instance);
}

describe('SendMessageDto voice fields', () => {
  it('accepts a voice message carrying duration and a waveform', async () => {
    const errors = await validateDto({ ...base, duration: 12, waveform: [0, 0.4, 1] });
    expect(errors).toHaveLength(0);
  });

  it('accepts a voice message without the optional duration/waveform', async () => {
    expect(await validateDto(base)).toHaveLength(0);
  });

  it('rejects a negative or fractional duration', async () => {
    expect(await validateDto({ ...base, duration: -1 })).not.toHaveLength(0);
    expect(await validateDto({ ...base, duration: 1.5 })).not.toHaveLength(0);
  });

  it('rejects a waveform that contains non-numeric samples', async () => {
    expect(await validateDto({ ...base, waveform: ['loud'] })).not.toHaveLength(0);
  });

  it('still requires a UUID clientTempId', async () => {
    expect(
      await validateDto({ type: 'VOICE', clientTempId: 'not-a-uuid' }),
    ).not.toHaveLength(0);
  });
});
