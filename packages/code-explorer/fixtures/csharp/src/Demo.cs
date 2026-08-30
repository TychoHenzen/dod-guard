class Demo {
    public void Entry() {        Helper(); }
    private static void Helper() { var item = new Item(); }
}

class Item {}

interface IWorker {}
class ConcreteWorker : IWorker {}
