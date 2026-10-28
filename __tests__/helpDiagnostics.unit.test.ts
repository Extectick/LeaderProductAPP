describe('Help development diagnostics boundary', () => {
  const previousDev = (globalThis as any).__DEV__;
  let info: jest.SpyInstance;
  beforeEach(() => { jest.resetModules(); delete (globalThis as any).__LEADER_HELP_DEV__; info=jest.spyOn(console,'info').mockImplementation(()=>{}); });
  afterEach(() => { info.mockRestore(); (globalThis as any).__DEV__=previousDev; delete (globalThis as any).__LEADER_HELP_DEV__; });
  test('release builds expose no inspector or fixture commands', () => {
    (globalThis as any).__DEV__=false;
    const diagnostics=require('../src/features/help/helpDiagnostics');
    diagnostics.enableHelpFixtureControls();
    diagnostics.helpDevState({screen:'list'});
    expect((globalThis as any).__LEADER_HELP_DEV__).toBeUndefined();
    expect(info).not.toHaveBeenCalled();
  });
  test('normal dev cannot execute controls and fixture command arguments are never logged', async () => {
    (globalThis as any).__DEV__=true;
    const diagnostics=require('../src/features/help/helpDiagnostics');
    const action=jest.fn();
    diagnostics.helpDevActions('test',{'composer.text':action});
    const bridge=(globalThis as any).__LEADER_HELP_DEV__;
    await expect(bridge.act('composer.text','private draft sentinel')).rejects.toThrow('isolated Help QA');
    expect(action).not.toHaveBeenCalled();
    diagnostics.enableHelpFixtureControls();
    await bridge.act('composer.text','private draft sentinel');
    expect(action).toHaveBeenCalledWith('private draft sentinel');
    const snapshot=await bridge.snapshot();
    expect(JSON.stringify(snapshot)).not.toContain('private draft sentinel');
    expect(JSON.stringify(info.mock.calls)).not.toContain('private draft sentinel');
    await expect(bridge.act('sendMessage')).rejects.toThrow('Unavailable');
  });
});
