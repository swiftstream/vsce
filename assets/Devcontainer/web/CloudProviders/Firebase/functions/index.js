import { onRequest } from 'firebase-functions/v2/https'
import { handleRenderRequest } from 'crawl-server/cloudFunction/firebase'
import logger from 'firebase-functions/logger'

const functionConfig = {
    // regions: ['europe-north1', 'australia-southeast1'], // Edit regions if needed
    concurrency: 80,
    timeoutSeconds: 15
}

// Render cloud function
export const renderHtml = onRequest(
    // functionConfig,
    async (req, reply) => {
        await handleRenderRequest(import.meta.url, logger, req, reply)
    }
)