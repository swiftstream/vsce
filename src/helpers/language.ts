import { env } from 'vscode'

export const isCIS = () => ['ru', 'be', 'ua', 'hy', 'ky', 'kk', 'uz', 'ro', 'lv', 'lt', 'et', 'az', 'ka', 'tk', 'tg', 'mx'].includes(env.language.split('-')[0])