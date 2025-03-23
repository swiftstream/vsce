import * as assert from 'assert'
import * as vscode from 'vscode'
import { DevContainerConfig } from '../devContainerConfig'

suite('Extension Test Suite', async () => {
	vscode.window.showInformationMessage('Start all tests.')

	const extensionId = "swiftstream.swiftstream"

	// Activate the extension
	const extension = vscode.extensions.getExtension(extensionId)
	assert.ok(extension, "Extension is not found")

	console.log(`1 extension.isActive: ${extension.isActive}`)
	
	if (!extension.isActive) {
		extension.activate()
	}

	while (!extension.isActive) {}

	console.log(`2 extension.isActive: ${extension.isActive}`)

	test('Dev Container Config test', async () => {
		assert.ok(extension.isActive, "Extension did not activate")
		let config = new DevContainerConfig()
		assert.strictEqual(config.hasFeature('swiftstream/vsce:latest'), false)
	})

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5))
		assert.strictEqual(-1, [1, 2, 3].indexOf(0))
	})
})
