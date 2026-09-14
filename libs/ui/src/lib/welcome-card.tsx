import { Button, Card } from '@thijulio/biome-react';
import { ThemeToggle } from './theme-toggle';
import styles from './welcome-card.module.css';

export function WelcomeCard({ health }: { health: 'loading' | 'available' | 'unavailable' }) {
  return (
    <main className={styles.page}>
      <div className={styles.utility}>
        <ThemeToggle />
        <span aria-live="polite">Service: {health}</span>
      </div>
      <Card className={styles.card}>
        <p className={styles.eyebrow}>A personal reading space</p>
        <h1>Thiago Smart Library</h1>
        <p>Hello, world.</p>
        <p>This early foundation is a calm place for the next chapter of a personal library.</p>
        <Button href="https://thiago-library.netlify.app">Visit the current prototype</Button>
      </Card>
    </main>
  );
}
