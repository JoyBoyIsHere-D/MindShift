package com.mindshift

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mindshift.modules.UsageStatsModule
import com.mindshift.modules.ServiceBridgeModule
import com.mindshift.modules.SyncModule

class MindShiftPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            UsageStatsModule(reactContext),
            ServiceBridgeModule(reactContext),
            SyncModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
