import Link from "next/link";
import { ArrowUpRight, ScanFace, Mic, Images, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/Brand";
export default function Home() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <Link href="/signin" className="text-link">
          Sign in
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <main id="main-content">
        <section className="landing-hero">
          <p className="product-label">KIN · FAMILY MEMORY</p>
          <h1>
            A little help.
            <br />A familiar world.
          </h1>
          <p>
            Photos and stories from the people you love.
            <br className="desktop-break" /> A gentle reminder when you need
            one.
          </p>
          <Link href="/signup" className="button button-primary button-lg">
            Get started
          </Link>
          <Link href="#how-it-works" className="text-link">
            See how it works<span aria-hidden="true">↓</span>
          </Link>
        </section>
        <section
          className="product-preview"
          aria-label="Illustration of Kin’s recognition interface"
        >
          <div className="preview-side">
            <Images aria-hidden="true" />
            <p>
              Your family.
              <br />
              <strong>Remembered together.</strong>
            </p>
          </div>
          <div className="preview-device" aria-hidden="true">
            <div className="device-island" />
            <div className="preview-app-name">kin</div>
            <div className="preview-scan">
              <ScanFace />
              <span />
            </div>
            <div className="preview-caption">
              <span>FAMILY RECOGNITION</span>
              <p>
                A familiar face.
                <br />
                In their own words.
              </p>
            </div>
            <div className="preview-control">
              <ScanFace />
              Who is this?
            </div>
            <div className="device-home" />
          </div>
          <div className="preview-side right">
            <Mic aria-hidden="true" />
            <p>
              Their stories.
              <br />
              <strong>In their voice.</strong>
            </p>
          </div>
        </section>
        <section className="landing-explanation" id="how-it-works">
          <h2>Start with a memory.</h2>
          <div>
            <p>
              <strong>Bring your family in.</strong> Add a photo and label the
              people in it. Record a story you share. Invite relatives to add
              what they remember.
            </p>
            <p>
              <strong>Make a connection.</strong> Point the camera at a person
              or their photo. When two relatives’ photos agree, Kin gives a
              short reminder using a memory your family shared.
            </p>
            <p>
              <strong>Keep the story growing.</strong> Kin finds missing details
              and asks the person who might remember. Their answer becomes part
              of your family’s library.
            </p>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <LockKeyhole size={16} aria-hidden="true" />
        <p>
          Your family’s memories stay in your family.
          <br />
          <span>Kin stays quiet when there isn’t a clear match.</span>
        </p>
      </footer>
    </div>
  );
}
