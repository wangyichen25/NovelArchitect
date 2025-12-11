export interface ThemeColors {
    background: string;
    foreground: string;
    card: string;
    'card-foreground': string;
    popover: string;
    'popover-foreground': string;
    primary: string;
    'primary-foreground': string;
    secondary: string;
    'secondary-foreground': string;
    muted: string;
    'muted-foreground': string;
    accent: string;
    'accent-foreground': string;
    destructive: string;
    'destructive-foreground': string;
    border: string;
    input: string;
    ring: string;
    [key: string]: string; // Allow for extra custom colors
}

export interface ThemeVariables {
    radius: string;
    'glass-bg'?: string;
    'glass-border'?: string;
    'glass-blur'?: string;
    [key: string]: string | undefined;
}

export interface Theme {
    id: string;
    name: string;
    type: 'light' | 'dark';
    colors: ThemeColors;
    variables: ThemeVariables;
}

export const DEFAULT_THEME_ID = 'default-light';
