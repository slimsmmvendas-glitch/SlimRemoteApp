package com.slimremote

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class RemoteControlModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "RemoteControl"
    }

    @ReactMethod
    fun simulateClick(normalizedX: Float, normalizedY: Float, promise: Promise) {
        val service = RemoteControlService.instance
        if (service != null) {
            // Converte de x,y normalizados (0.0 até 1.0) para pixels absolutos da tela da TV Box
            val metrics = reactApplicationContext.resources.displayMetrics
            val absoluteX = normalizedX * metrics.widthPixels
            val absoluteY = normalizedY * metrics.heightPixels
            
            service.simulateClick(absoluteX, absoluteY)
            promise.resolve(true)
        } else {
            promise.reject("SERVICE_NOT_RUNNING", "Serviço de Acessibilidade não está rodando")
        }
    }
    
    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        promise.resolve(RemoteControlService.instance != null)
    }
}
