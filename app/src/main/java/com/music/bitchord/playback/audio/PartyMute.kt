package com.music.bitchord.playback.audio

import com.music.bitchord.data.listentogether.ListenTogether
import com.music.bitchord.data.settings.AppSettings

/**
 * Whether the party has silenced this device.
 *
 * The switch is read here, at the last stage before a sample reaches the DAC,
 * rather than anywhere in the player: silence has to be something the player
 * cannot tell apart from normal playback. Everything above this point —
 * `playWhenReady`, the playhead, the queue diffing that [com.music.bitchord.playback.PartySync]
 * publishes — keeps describing a device that is playing along, so skip, next,
 * seek and the queue all carry on working while nothing comes out.
 *
 * An earlier version paused instead, and the pause was indistinguishable from
 * the listener stopping: every control on a muted device went dead. This is the
 * same rule the desktop client follows, where the mute is a gain of zero.
 *
 * Two plain `.value` reads on purpose. This is evaluated once per audio block,
 * on the audio thread, so a subscription here would put a coroutine between the
 * mixer and every sample it drains.
 */
internal object PartyMute {

    val silenced: Boolean
        get() = ListenTogether.state.value.inParty && !AppSettings.playInPartyOnThisDevice.value

    /** Zeros [count] samples at [offset]; the block's frame count is left alone. */
    fun silence(samples: FloatArray, offset: Int, count: Int) {
        if (count > 0) samples.fill(0f, offset, offset + count)
    }

    /**
     * The same for an encoded PCM buffer, between its position and its limit.
     *
     * `put(index, byte)` throws [java.nio.ReadOnlyBufferException] on a
     * read-only buffer, and a decoder is entitled to hand one over. Rather than
     * let that reach the audio thread, the check is made first and the buffer
     * is left alone when it cannot be written — a muted device stays audible
     * for that one block instead of crashing the renderer.
     */
    fun silence(buffer: java.nio.ByteBuffer) {
        if (buffer.isReadOnly) return
        for (index in buffer.position() until buffer.limit()) buffer.put(index, 0.toByte())
    }
}
