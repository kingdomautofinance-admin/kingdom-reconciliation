# Dark Mode Implementation

## Overview

The Conciliação Pro system now includes a complete dark mode implementation with smooth transitions and proper contrast ratios.

## Features

### Toggle Button
- Moon icon in light mode
- Sun icon in dark mode
- Located in the top-right corner of the navigation bar
- Smooth transitions between themes

### Theme Persistence
- Theme preference saved to localStorage
- Automatically restores user's last selected theme
- Respects system preference on first visit

### Color Scheme

#### Light Mode
- Background: White/Slate-50
- Cards: White with light borders
- Text: Dark gray/Black
- Primary: Dark blue-gray

#### Dark Mode
- Background: Slate-950 (very dark blue-gray)
- Cards: Slate-900 with darker borders (Slate-800)
- Text: Light gray/White
- Primary: Light colors with good contrast

### Components with Dark Mode Support

1. **Navigation Bar**
   - Background: White → Slate-900
   - Border: Gray-200 → Slate-800
   - Text: Proper contrast in both modes
   - Active links highlighted appropriately

2. **Cards**
   - Background: White → Slate-900
   - Borders: Light gray → Slate-800
   - Shadows maintained for depth

3. **Badges (Status Indicators)**
   - Reconciled: Green-100/800 → Green-900/200
   - Pending Ledger: Blue-100/800 → Blue-900/200
   - Pending Statement: Orange-100/800 → Orange-900/200

4. **Progress Bar**
   - Background track: Gray-200 → Gray-700
   - Progress fill: Green-600 → Green-500

5. **Forms & Inputs**
   - Inherit theme colors via CSS variables
   - Proper focus states in both modes

## Technical Implementation

### CSS Variables
```css
:root {
  /* Light mode variables */
}

.dark {
  /* Dark mode variables */
}
```

### React Hook
```typescript
useTheme() // Returns { theme, toggleTheme }
```

### Tailwind Configuration
- `darkMode: 'class'` enables class-based dark mode
- CSS variables mapped to Tailwind colors
- Automatic dark: prefix support

## Usage

Click the moon/sun icon in the navigation bar to toggle between light and dark modes. Your preference will be saved automatically.

## Browser Support

Works in all modern browsers that support:
- CSS custom properties
- localStorage
- prefers-color-scheme media query

## Future Enhancements

- [ ] Add animated theme transition
- [ ] Auto-switch based on time of day
- [ ] High contrast mode option
- [ ] Custom color themes
