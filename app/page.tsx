import { requireChatGPTUser } from './chatgpt-auth';
import Atlas from './components/Atlas';
export const dynamic='force-dynamic';
export default async function Home(){await requireChatGPTUser('/');return <Atlas/>;}
