import { NextRequest, NextResponse } from 'next/server';
import { getProductById } from '@/lib/supabase';

export async function GET(
  _: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await paramsPromise;
    const product = await getProductById(id);

    if (!product) {
      return NextResponse.json({ error: 'Product is not found' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('API Product Details Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
