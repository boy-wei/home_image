import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: { action: string } }) {
  // Check the action before forwarding
  const { action } = params;
  if (!['launch', 'verify', 'consume'].includes(action)) {
    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const targetUrl = `http://aibigtree.com/api/tool/${action}`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    
    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "代理转发失败" }, { status: 500 });
  }
}

// Ensure preflight OPTION requests check out properly
export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}
