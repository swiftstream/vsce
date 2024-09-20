import { devSocket } from './wasi/devSocket.js'
import { overrideFS } from './wasi/overrideFS.js'
import { startWasiTask } from './wasi/startTask.js'
import { wasiErrorHandler } from './wasi/errorHandler.js'

self.serviceInstallWasCalled = false
self.serviceInstalled = false

const serviceWorkerInstallPromise = new Promise((resolve, reject) => {
    function check(resolve) {
        setTimeout(() => {
            if (self.serviceInstalled) {
                resolve()
            } else if (self.serviceInstallationError) {
                reject(self.serviceInstallationError);
            } else {
                check(resolve)
            }
        }, 1000)
    }
    check(resolve)
})

self.addEventListener('install', event => {
    self.serviceInstallWasCalled = true
    event.waitUntil(serviceWorkerInstallPromise)
})
self.addEventListener('activate', event => {
    self.activate(event)
})
self.addEventListener('contentdelete', event => {
    self.contentDelete(event)
})
self.addEventListener('fetch', event => {
    self.fetch(event)
})
self.addEventListener('message', event => {
    self.message(event)
})
self.addEventListener('notificationclick', event => {
    self.notificationClick(event)
})
self.addEventListener('notificationclose', event => {
    self.notificationClose(event)
})
self.addEventListener('push', event => {
    self.push(event)
})
self.addEventListener('pushsubscriptionchange', event => {
    self.pushSubscriptionChange(event)
})
self.addEventListener('sync', event => {
    self.sync(event)
})

overrideFS(devSocket)

try {
    startWasiTask(env.app.target, true).catch(wasiErrorHandler)
} catch (e) {
    wasiErrorHandler(e)
}