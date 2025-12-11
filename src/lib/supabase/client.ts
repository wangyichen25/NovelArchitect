
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
    createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wqsylnfihcbkbsrpayew.supabase.co',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_w2u9XdGtuodQ0Gy5uVqfqg_iKJTh_nx'
    )
