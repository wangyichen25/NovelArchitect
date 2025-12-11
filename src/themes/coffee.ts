import { Theme } from '@/types/theme';

export const coffeeTheme: Theme = {
    id: 'coffee',
    name: 'Coffee House',
    type: 'light',
    colors: {
        background: '35 30% 92%', // Warm Beige
        foreground: '25 20% 20%', // Dark Brown
        card: '35 30% 88%',
        'card-foreground': '25 20% 20%',
        popover: '35 30% 92%',
        'popover-foreground': '25 20% 20%',
        primary: '25 60% 35%', // Roasted Bean
        'primary-foreground': '35 30% 95%',
        secondary: '35 20% 85%',
        'secondary-foreground': '25 20% 20%',
        muted: '35 20% 80%',
        'muted-foreground': '25 10% 40%',
        accent: '35 20% 85%',
        'accent-foreground': '25 20% 20%',
        destructive: '0 60% 40%',
        'destructive-foreground': '35 30% 95%',
        border: '25 15% 80%',
        input: '25 15% 80%',
        ring: '25 60% 35%',
    },
    variables: {
        radius: '0.5rem',
    },
};
