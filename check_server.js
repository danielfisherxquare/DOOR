async function check() {
    try {
        const res = await fetch('http://47.251.107.41/api/tools/app-info');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        console.log('API Response:', json);
    } catch (e) {
        console.error('API Error:', e.message);
    }

    try {
        const res = await fetch('http://47.251.107.41/');
        const html = await res.text();
        const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
        if (match) {
            console.log('\nJS Asset:', match[1]);
            const jsRes = await fetch('http://47.251.107.41' + match[1]);
            const js = await jsRes.text();
            console.log('Contains app-download:', js.includes('app-download'));
            console.log('Contains mechanical-clock-3d:', js.includes('mechanical-clock-3d'));
            console.log('Contains json-formatter (should be false if updated):', js.includes('json-formatter'));
        } else {
            console.log('No JS asset found in index.html');
        }
    } catch (e) {
        console.error('Frontend Error:', e.message);
    }
}
check();
