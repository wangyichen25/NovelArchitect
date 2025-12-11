import { Theme } from '@/types/theme';

export const midnightTheme: Theme = {
    id: 'midnight',
    name: 'Midnight Blue',
    type: 'dark',
    colors: {
        background: '222 47% 11%',
        foreground: '210 40% 98%',
        card: '217 33% 17%',
        'card-foreground': '210 40% 98%',
        popover: '222 47% 11%',
        'popover-foreground': '210 40% 98%',
        primary: '210 100% 50%', // Bright Sky Blue
        'primary-foreground': '222 47.4% 11.2%',
        secondary: '217 33% 17%',
        'secondary-foreground': '210 40% 98%',
        muted: '217 33% 17%',
        'muted-foreground': '215 20.2% 65.1%',
        accent: '217 33% 17%',
        'accent-foreground': '210 40% 98%',
        destructive: '0 62.8% 30.6%',
        'destructive-foreground': '210 40% 98%',
        border: '217 33% 17%',
        input: '217 33% 17%',
        ring: '210 100% 50%',
    },
    variables: {
        radius: '0.75rem',
    },
};
