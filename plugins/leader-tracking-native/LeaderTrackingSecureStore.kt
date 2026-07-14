package __LEADER_APP_PACKAGE__.tracking

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Keeps the device tracking credential and outbox encrypted at rest whenever
 * Android Keystore is available. A plain SharedPreferences fallback is only
 * used on a keystore failure so tracking can keep the most recent points.
 */
object LeaderTrackingSecureStore {
  private const val KEY_ALIAS = "leader_product_tracking_v1"
  private const val ENCRYPTED_SUFFIX = ".encrypted"
  private const val FALLBACK_SUFFIX = ".fallback"
  private const val IV_LENGTH = 12
  private const val TAG_LENGTH_BITS = 128

  fun get(context: Context, prefs: SharedPreferences, key: String): String? {
    val encrypted = prefs.getString(key + ENCRYPTED_SUFFIX, null)
    if (!encrypted.isNullOrBlank()) {
      try {
        return decrypt(encrypted)
      } catch (_: Throwable) {
        // A restored/invalidated Keystore key cannot decrypt old secrets. Keep
        // the fallback if present and let the caller recover its credential.
      }
    }

    val fallback = prefs.getString(key + FALLBACK_SUFFIX, null)
    if (!fallback.isNullOrBlank()) return fallback

    // Migration path from the first native tracking release.
    val legacy = prefs.getString(key, null)
    if (!legacy.isNullOrBlank()) {
      put(context, prefs, key, legacy)
      prefs.edit().remove(key).apply()
      return legacy
    }
    return null
  }

  fun put(context: Context, prefs: SharedPreferences, key: String, value: String) {
    try {
      val encrypted = encrypt(value)
      prefs.edit()
        .putString(key + ENCRYPTED_SUFFIX, encrypted)
        .remove(key + FALLBACK_SUFFIX)
        .remove(key)
        .apply()
    } catch (_: Throwable) {
      // Do not discard a route because a vendor Keystore implementation is
      // unavailable. The caller exposes this degraded mode in diagnostics.
      prefs.edit()
        .putString(key + FALLBACK_SUFFIX, value)
        .remove(key)
        .apply()
    }
  }

  fun remove(prefs: SharedPreferences, key: String) {
    prefs.edit()
      .remove(key + ENCRYPTED_SUFFIX)
      .remove(key + FALLBACK_SUFFIX)
      .remove(key)
      .apply()
  }

  fun isEncrypted(prefs: SharedPreferences, key: String): Boolean =
    !prefs.getString(key + ENCRYPTED_SUFFIX, null).isNullOrBlank()

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
    if (existing != null) return existing

    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    val spec = KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
    generator.init(spec)
    return generator.generateKey()
  }

  private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val bytes = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
    return Base64.encodeToString(cipher.iv + bytes, Base64.NO_WRAP)
  }

  private fun decrypt(value: String): String {
    val payload = Base64.decode(value, Base64.NO_WRAP)
    require(payload.size > IV_LENGTH) { "Invalid encrypted tracking payload" }
    val iv = payload.copyOfRange(0, IV_LENGTH)
    val ciphertext = payload.copyOfRange(IV_LENGTH, payload.size)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_LENGTH_BITS, iv))
    return String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
  }
}
