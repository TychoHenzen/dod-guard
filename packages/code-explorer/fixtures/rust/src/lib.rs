fn entry() {
    helper();
}

fn helper() {
    let _item = Item;
}

struct Item;

trait Worker {}
struct ConcreteWorker;
impl Worker for ConcreteWorker {}
