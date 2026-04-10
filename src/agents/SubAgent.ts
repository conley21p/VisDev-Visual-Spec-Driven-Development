import { BaseAgent } from './BaseAgent';

export abstract class SubAgent extends BaseAgent {
    // Sub-agents might have specific logic for reporting high-fidelity results
    // or narrow task focus, but for now they share the BaseAgent loop.
}
