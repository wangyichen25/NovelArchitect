import { Theme } from '@/types/theme';

export const forestTheme: Theme = {
    id: 'forest',
    name: 'Deep Forest',
    type: 'dark',
    colors: {
        background: '150 20% 10%', // Dark green/black
        foreground: '140 30% 90%',
        card: '150 15% 14%',
        'card-foreground': '140 30% 90%',
        popover: '150 20% 10%',
        'popover-foreground': '140 30% 90%',
        primary: '142 70% 40%', // Emerald
        'primary-foreground': '150 20% 98%',
        secondary: '150 15% 20%',
        'secondary-foreground': '140 30% 90%',
        muted: '150 15% 20%',
        'muted-foreground': '140 20% 60%',
        accent: '150 15% 20%',
        'accent-foreground': '140 30% 90%',
        destructive: '0 62.8% 30.6%',
        'destructive-foreground': '140 30% 90%',
        border: '150 20% 18%',
        input: '150 20% 18%',
        ring: '142 70% 40%',
    },
    variables: {
        radius: '0.3rem', // Boxier
    },
};
