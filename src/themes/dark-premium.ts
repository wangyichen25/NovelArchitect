import { Theme } from '@/types/theme';

export const premiumDarkTheme: Theme = {
    id: 'premium-dark',
    name: 'Premium Dark',
    type: 'dark',
    colors: {
        // Pure dark background, less navigation blue
        background: '240 10% 4%', // Very dark gray/zinc
        foreground: '240 5% 90%', // Soft white

        card: '240 10% 6%',
        'card-foreground': '240 5% 90%',

        popover: '240 10% 6%',
        'popover-foreground': '240 5% 90%',

        // Minimalistic primary: using a white/gray approach or a very subtle accent
        // Instead of purple, let's go with a sophisticated monochrome or subtle indigo
        primary: '240 6% 90%', // High contrast against dark, but monochrome
        'primary-foreground': '240 10% 4%',

        secondary: '240 4% 16%',
        'secondary-foreground': '240 5% 90%',

        muted: '240 4% 16%',
        'muted-foreground': '240 5% 60%',

        accent: '240 4% 16%',
        'accent-foreground': '240 5% 90%',

        destructive: '0 62.8% 30.6%',
        'destructive-foreground': '240 5% 90%',

        border: '240 4% 16%',
        input: '240 4% 16%',
        ring: '240 5% 84%',
    },
    variables: {
        radius: '0.5rem',
        'glass-bg': '240 10% 6% 0.7',
        'glass-border': '240 4% 20% 0.2',
        'glass-blur': '8px', // Reduced blur for cleaner look
    },
};
