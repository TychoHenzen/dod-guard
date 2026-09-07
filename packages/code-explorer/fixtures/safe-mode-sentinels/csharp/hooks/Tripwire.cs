namespace SafeModeSentinel;

internal static class Tripwire
{
    internal static void Trigger(string hook)
    {
        var tripwire = Environment.GetEnvironmentVariable("CODE_EXPLORER_SENTINEL_PATH");
        if (string.IsNullOrWhiteSpace(tripwire)) return;
        File.WriteAllText($"{tripwire}.{hook}", hook);
    }
}
