try {
    const Menus = require('@tiptap/react/dist/menus');
    console.log('Exports of @tiptap/react/dist/menus:', Object.keys(Menus));
} catch (e) {
    console.error('Failed to import menus:', e.message);
}
