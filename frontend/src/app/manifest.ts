import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'MSINFOR PWA ESCOLAR',
        short_name: 'MSINFOR',
        description: 'PWA escolar com acesso para aluno, professor e responsavel.',
        start_url: '/',
        display: 'standalone',
        background_color: '#eff6ff',
        theme_color: '#1d4ed8',
        lang: 'pt-BR',
        orientation: 'portrait',
        icons: [
            {
                src: '/logo-msinfor.png',
                sizes: '512x512',
                type: 'image/png',
            },
            {
                src: '/logo-msinfor.jpg',
                sizes: '192x192',
                type: 'image/jpeg',
            },
        ],
    };
}
