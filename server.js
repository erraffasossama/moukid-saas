const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const fs = require('fs');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'moukid-secret-2024', resave: false, saveUninitialized: true }));

let users = {}; // فالأول نحفظو فالذاكرة، من بعد نديرو DB
let waClients = {};
let qrCodes = {};

if (fs.existsSync('./users.json')) {
    users = JSON.parse(fs.readFileSync('./users.json'));
}

function saveUsers(){ fs.writeFileSync('./users.json', JSON.stringify(users)); }

function createWaClient(userId){
    const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    console.log(`كنصاوب بوت لـ ${userId} => ${safeId}`);
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: safeId }),
        puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] }
    });
    client.on('qr', async qr => {
        qrCodes[userId] = await QRCode.toDataURL(qr);
        console.log(`QR for ${userId}`);
    });
    client.on('ready', () => {
        console.log(`✅ ${userId} جاهز`);
        qrCodes[userId] = 'READY';
    });
    client.on('message', async msg => {
        if(msg.fromMe) return;
        let t = msg.body.toLowerCase().trim();
        if(t=='1' || t.includes('نعم')) await msg.reply('✅ شكراً لتأكيدك! طلبك غادي يخرج غدا 🚚');
        if(t=='2' || t.includes('لا')) await msg.reply('واخا تم إلغاء الطلب 🙏');
    });
    client.initialize();
    waClients[userId] = client;
}

// صفحات
app.get('/', (req,res) => res.sendFile(__dirname + '/login.html'));

app.get('/dashboard', (req,res) => {
    if(!req.session.userId) return res.redirect('/');
    let user = users[req.session.userId];
    if(!user) return res.redirect('/');
    // تشيك الاشتراك
    if(new Date() > new Date(user.expireAt)){
        return res.send(`<h2>❌ انتهى اشتراكك</h2><p>خلص 99 درهم باش ترجع تخدم</p><a href="https://wa.me/2126XXXXXXXX?text=بغيت نخلص اشتراك Moukid">خلص عبر واتساب</a>`);
    }
    res.sendFile(__dirname + '/dashboard.html');
});

app.post('/register', (req,res) => {
    const { email, password } = req.body;
    if(users[email]) return res.send('كاين already');
    users[email] = { email, password, expireAt: new Date(Date.now() + 3*24*60*60*1000) }; // 3 ايام فابور
    saveUsers();
    createWaClient(email);
    req.session.userId = email;
    res.redirect('/dashboard');
});

app.post('/login', (req,res) => {
    const { email, password } = req.body;
    if(!users[email] || users[email].password!== password) return res.send('خطأ فالمعلومات');
    req.session.userId = email;
    if(!waClients[email]) createWaClient(email);
    res.redirect('/dashboard');
});

app.get('/qr', (req,res) => {
    if(!req.session.userId) return res.json({qr:null});
    res.json({qr: qrCodes[req.session.userId] || null});
});

app.post('/send', async (req,res) => {
    if(!req.session.userId) return res.json({success:false});
    try{
        let { numero, smiya } = req.body;
        let n = numero.replace(/\D/g,'');
        if(n.startsWith('0')) n='212'+n.slice(1);
        if(!n.startsWith('212')) n='212'+n;
        let text = `السلام ${smiya} 👋 معاك شركة ${req.session.userId}، عندك طلب باقي ما تأكدش.\nجاوب ب:\n1 - نعم ✅\n2 - لا ❌`;
        await waClients[req.session.userId].sendMessage(`${n}@c.us`, text);
        res.json({success:true});
    }catch(e){ res.json({success:false, error:e.message}); }
});

app.listen(3000, () => console.log('Moukid SaaS خدام على http://localhost:3000'));

// رجعو الكليان القدام
Object.keys(users).forEach(id => createWaClient(id));