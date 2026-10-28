import Link from 'next/link';

export const metadata = { title: 'Privacy' };
const CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT || 'the person who runs this server';

const Row = ({ who, what, why }: { who: string; what: string; why: string }) => (
  <li className="rounded-md border-2 border-line bg-surface p-3"><p className="font-bold text-ink">{who}</p><p className="text-base text-muted">{what}</p><p className="text-base text-muted">{why}</p></li>
);

export default function Privacy() {
  return (
    <>
      <Link href="/welcome" className="min-h-target text-base font-bold text-accent underline">‹ Back</Link>
      <h1 className="font-display text-xl text-ink">Privacy</h1>
      <p className="text-base text-ink">Your family’s calendar, chores, lists, recipes and photos are kept in this server’s database. {CONTACT[0].toUpperCase() + CONTACT.slice(1)} runs it and decides who can sign up. Ask them about anything on this page.</p>
      <h2 className="font-display text-lg text-ink">What is kept</h2>
      <ul className="m-0 list-disc pl-6 text-base text-ink"><li>Your name, email address and a scrambled form of your password (never the password itself).</li><li>Everything you add: events, chores, stars, lists, recipes, meal plans, photos.</li><li>Saved keys you add yourself (Google sign-in, AI keys). They are encrypted.</li><li>Nothing is sold, and there is no tracking or analytics in the app.</li></ul>
      <h2 className="font-display text-lg text-ink">Other companies that handle some of it</h2>
      <p className="text-base text-muted">Each one is used only if a feature needs it.</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <Row who="The company hosting this server" what="Stores the database and the photo folder." why="Needed for the app to work at all." />
        <Row who="Google (Calendar)" what="If you connect Google Calendar: the events on the calendars you choose, and a sign-in token we keep encrypted." why="You can disconnect at any time in Settings, Calendars. That also tells Google to forget the token." />
        <Row who="Your AI provider (OpenAI, Anthropic, Google or your own server)" what="Only if you add a key: the text you send to the AI helper, such as a pasted recipe or message." why="You choose the provider and can remove the key at any time. We keep the text for one day, then erase it." />
        <Row who="Open-Meteo" what="The place name you set in Household settings, to show the weather." why="No account or personal details are sent." />
        <Row who="The email service this server uses" what="Your email address and the text of messages such as invitations and password resets." why="Only if the person running the server set one up." />
        <Row who="Advertisers (only if ads are on)" what="Nothing is sent while a card is showing. If someone taps a card, their browser goes to the advertiser’s page and the advertiser sees that visit, without any household details from us." why="Ads appear only between photos on the screensaver, and you can turn them off in Settings, Display and ads." />
      </ul>
      <h2 className="font-display text-lg text-ink">Your choices</h2>
      <ul className="m-0 list-disc pl-6 text-base text-ink"><li>Download everything in Settings, Account.</li><li>Delete everything, including photos and connections, in Settings, Account. It is removed from the database at once; backups are overwritten within 14 days.</li><li>Sign out of other devices in Settings, Account.</li></ul>
    </>
  );
}
