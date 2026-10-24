import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // 1. Parse the simple Slack-style payload
    const { text } = await req.json() as { text: string };

    if (!text) {
      return NextResponse.json({ error: 'The "text" field is required' }, { status: 400 });
    }

    // 2. Pull your credentials securely from environment variables
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID; // The specific Chat ID you want to alert

    if (!botToken || !chatId) {
      return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
    }

    // 3. Forward the request to Telegram's actual endpoint
    
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML"
      }),
    });

    const data = (await telegramResponse.json()) as { ok: boolean; description?: string };

    if (!data.ok) {
      return NextResponse.json({ error: data.description }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Notification sent to Telegram' });

  } catch (error) {
    console.error('Notification Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}