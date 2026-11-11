package com.music.bitchord.playback

import com.music.bitchord.data.listentogether.ListenTogether
import com.music.bitchord.ui.player.PlayerPlatform

/**
 * The level the host has set for this device, applied to its music stream.
 *
 * The party stores a number; only this device can act on it, and the only lever
 * it has is `STREAM_MUSIC`. That means the level is a *request*, not a rule:
 * the listener's own hardware volume keys still override it a second later,
 * because the system volume is shared with every other app and the platform
 * gives a foreground device the last word. Applying it again on every change
 * is the most this side can honestly do, and pretending otherwise would be a
 * setting that works on paper and not in a hand.
 *
 * Deliberately not [com.music.bitchord.playback.audio.PartyMute]: that one is
 * the *listener's* switch and gets the final say on this device. A host cannot
 * un-silence a device whose owner turned "Play on this device" off, because the
 * mute there is the owner's own. The two compose as a minimum of the two gains.
 */
internal object PartyVolume {

    /**
     * The host's level for this device, 0–100, or null when the host has not
     * set one. Read straight off the members list, so it costs nothing until
     * the members frame has actually arrived.
     */
    val hostLevel: Int?
        get() {
            val state = ListenTogether.state.value
            val you = state.you ?: return null
            return state.members.firstOrNull { it.memberId == you.memberId }?.volumePercent
        }

    /**
     * Pushes whatever the party currently says onto the device's music stream.
     *
     * A harmless no-op outside a party and when the host has set nothing, so the
     * caller can apply it unconditionally after any frame that might have
     * carried a new level.
     */
    fun apply() {
        val percent = hostLevel ?: return
        // `PlayerPlatform.host` throws until `install` has run. The party cannot
        // be live before the application is up — but a test process or a future
        // early call could ask, and a party is not worth crashing for.
        val volume = runCatching { PlayerPlatform.host.volume }.getOrNull() ?: return
        val level = percent.coerceIn(0, 100) / 100f
        // One platform's "set" is another's round-trip through a ContentObserver,
        // so compare before writing: re-setting the same level would post a
        // change nothing asked for, once per heartbeat.
        if (kotlin.math.abs(volume.level.value - level) < LEVEL_EPSILON) return
        volume.set(level)
    }

    /** Close enough that writing it would only move the OS rounding, not the loudness. */
    private const val LEVEL_EPSILON = 0.005f
}
